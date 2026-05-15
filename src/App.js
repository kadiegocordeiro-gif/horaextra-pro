import { useState, useCallback } from "react";

// ─── CONSTANTES ───────────────────────────────────────────────────────────────
const FERIADOS_NACIONAIS = ["01-01","04-21","05-01","09-07","10-12","11-02","11-15","11-20","12-25"];
const DIAS_SEMANA = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];
const DIAS_KEYS = ["dom","seg","ter","qua","qui","sex","sab"];
const SESSION_KEY = "hx_session";
const SESSION_TIMEOUT = 8 * 60 * 60 * 1000; // 8h

const JORNADA_DEFAULT = {
  dom:{ativo:false,entrada:"06:00",saida:"14:00",intervalo:60},
  seg:{ativo:true,entrada:"06:00",saida:"15:00",intervalo:60},
  ter:{ativo:true,entrada:"06:00",saida:"15:00",intervalo:60},
  qua:{ativo:true,entrada:"06:00",saida:"14:00",intervalo:60},
  qui:{ativo:true,entrada:"06:00",saida:"14:00",intervalo:60},
  sex:{ativo:true,entrada:"06:00",saida:"14:00",intervalo:60},
  sab:{ativo:false,entrada:"06:00",saida:"14:00",intervalo:60},
};

const TEMPLATES = {
  "44h/5x2":{dom:{ativo:false,entrada:"08:00",saida:"17:48",intervalo:60},seg:{ativo:true,entrada:"08:00",saida:"17:48",intervalo:60},ter:{ativo:true,entrada:"08:00",saida:"17:48",intervalo:60},qua:{ativo:true,entrada:"08:00",saida:"17:48",intervalo:60},qui:{ativo:true,entrada:"08:00",saida:"17:48",intervalo:60},sex:{ativo:true,entrada:"08:00",saida:"17:48",intervalo:60},sab:{ativo:false,entrada:"08:00",saida:"12:00",intervalo:0}},
  "44h/6x1":{dom:{ativo:false,entrada:"06:00",saida:"14:20",intervalo:60},seg:{ativo:true,entrada:"06:00",saida:"14:20",intervalo:60},ter:{ativo:true,entrada:"06:00",saida:"14:20",intervalo:60},qua:{ativo:true,entrada:"06:00",saida:"14:20",intervalo:60},qui:{ativo:true,entrada:"06:00",saida:"14:20",intervalo:60},sex:{ativo:true,entrada:"06:00",saida:"14:20",intervalo:60},sab:{ativo:true,entrada:"06:00",saida:"12:20",intervalo:20}},
  "12x36":{dom:{ativo:false,entrada:"07:00",saida:"19:00",intervalo:60},seg:{ativo:true,entrada:"07:00",saida:"19:00",intervalo:60},ter:{ativo:false,entrada:"07:00",saida:"19:00",intervalo:60},qua:{ativo:true,entrada:"07:00",saida:"19:00",intervalo:60},qui:{ativo:false,entrada:"07:00",saida:"19:00",intervalo:60},sex:{ativo:true,entrada:"07:00",saida:"19:00",intervalo:60},sab:{ativo:false,entrada:"07:00",saida:"19:00",intervalo:60}},
};

// ─── HASH SIMPLES (sem backend — usa btoa como ofuscação) ─────────────────────
const hashPassword = (pwd) => btoa(unescape(encodeURIComponent("hxp_" + pwd)));
const checkPassword = (pwd, hash) => hashPassword(pwd) === hash;

// ─── VALIDAÇÃO DE SENHA ───────────────────────────────────────────────────────
const validarSenha = (pwd) => {
  const erros = [];
  if (pwd.length < 8) erros.push("Mínimo 8 caracteres");
  if (!/[a-zA-Z]/.test(pwd)) erros.push("Pelo menos 1 letra");
  if (!/[0-9]/.test(pwd)) erros.push("Pelo menos 1 número");
  return erros;
};

const forcaSenha = (pwd) => {
  if (!pwd) return 0;
  let f = 0;
  if (pwd.length >= 8) f++;
  if (pwd.length >= 12) f++;
  if (/[a-zA-Z]/.test(pwd)) f++;
  if (/[0-9]/.test(pwd)) f++;
  if (/[^a-zA-Z0-9]/.test(pwd)) f++;
  return f;
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const isFeriadoNacional = (date) => { const mm=String(date.getMonth()+1).padStart(2,"0"); const dd=String(date.getDate()).padStart(2,"0"); return FERIADOS_NACIONAIS.includes(`${mm}-${dd}`); };
const isDomingo = (date) => date.getDay()===0;
const parseTime = (str) => { if(!str) return null; const [h,m]=str.split(":").map(Number); return h*60+m; };
const minToHHMM = (min) => { const s=min<0?"-":""; const a=Math.abs(min); return `${s}${String(Math.floor(a/60)).padStart(2,"0")}:${String(a%60).padStart(2,"0")}`; };
const fmt = (n) => n.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const fmtDateStr = (dateStr) => new Date(dateStr+"T12:00:00").toLocaleDateString("pt-BR");

const jornadaDiaria = (dia) => {
  if(!dia||!dia.ativo) return 0;
  const e=parseTime(dia.entrada),s=parseTime(dia.saida);
  if(!e||!s) return 0;
  let d=s-e-(parseInt(dia.intervalo)||0);
  if(d<0) d+=24*60;
  return Math.max(0,d);
};

const calcDay = (entry,exit,interval,contractMin,valorHora,isSpecial) => {
  if(!entry||!exit) return null;
  const e=parseTime(entry),s=parseTime(exit),i=parseInt(interval)||0;
  let worked=s-e-i; if(worked<0) worked+=24*60;
  const normal=Math.min(worked,contractMin);
  let extra50=0,extra100=0,alerteLimite=false;
  if(isSpecial){extra100=worked;}
  else{const over=worked-contractMin;if(over>0){extra50=over;if(over>120)alerteLimite=true;}}
  const delay=Math.max(0,contractMin-worked);
  const val50=(extra50/60)*valorHora*1.5, val100=(extra100/60)*valorHora*2;
  return {worked,normal,extra50,extra100,delay,val50,val100,total:val50+val100,alerteLimite};
};

const calcularPeriodoPagamento = (fechamentoExtras) => {
  const hoje=new Date(); const diaFech=parseInt(fechamentoExtras)||15; const diaAtual=hoje.getDate();
  let inicioMes,inicioAno,fimMes,fimAno;
  if(diaAtual>diaFech){inicioAno=hoje.getFullYear();inicioMes=hoje.getMonth();fimMes=hoje.getMonth()+1;fimAno=hoje.getFullYear();if(fimMes>11){fimMes=0;fimAno++;}}
  else{inicioMes=hoje.getMonth()-1;inicioAno=hoje.getFullYear();if(inicioMes<0){inicioMes=11;inicioAno--;}fimMes=hoje.getMonth();fimAno=hoje.getFullYear();}
  const inicio=`${inicioAno}-${String(inicioMes+1).padStart(2,"0")}-${String(diaFech+1).padStart(2,"0")}`;
  const fim=`${fimAno}-${String(fimMes+1).padStart(2,"0")}-${String(diaFech).padStart(2,"0")}`;
  return {inicio,fim};
};

const calcularProximoPagamento = (registrosComCalc,fechamentoExtras) => {
  const {inicio,fim}=calcularPeriodoPagamento(fechamentoExtras);
  const filtrados=registrosComCalc.filter(r=>r.data>=inicio&&r.data<=fim);
  return filtrados.reduce((acc,r)=>{
    if(!r.calc) return acc;
    acc.extra50+=r.calc.extra50;acc.extra100+=r.calc.extra100;acc.val50+=r.calc.val50;acc.val100+=r.calc.val100;acc.registros.push(r);
    return acc;
  },{extra50:0,extra100:0,val50:0,val100:0,registros:[],inicio,fim});
};

const calcularHistoricoTotal = (registrosComCalc) =>
  registrosComCalc.reduce((acc,r)=>{
    if(!r.calc) return acc;
    acc.extra50+=r.calc.extra50;acc.extra100+=r.calc.extra100;acc.val50+=r.calc.val50;acc.val100+=r.calc.val100;acc.worked+=r.calc.worked;
    return acc;
  },{extra50:0,extra100:0,val50:0,val100:0,worked:0});

const useStorage = (key,def) => {
  const [v,setV]=useState(()=>{ try{const s=localStorage.getItem(key);return s?JSON.parse(s):def;}catch{return def;} });
  const save=useCallback((val)=>{setV(val);try{localStorage.setItem(key,JSON.stringify(val));}catch{}},[key]);
  return [v,save];
};

// ─── ICONS ────────────────────────────────────────────────────────────────────
const Icon = ({name,size=20,color="currentColor"}) => {
  const p={stroke:color,strokeWidth:"2",fill:"none"};
  const icons={
    home:<svg width={size} height={size} viewBox="0 0 24 24" {...p}><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
    plus:<svg width={size} height={size} viewBox="0 0 24 24" {...p}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
    chart:<svg width={size} height={size} viewBox="0 0 24 24" {...p}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
    settings:<svg width={size} height={size} viewBox="0 0 24 24" {...p}><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93l-1.41 1.41M4.93 4.93l1.41 1.41M12 2v2M12 20v2M20 12h2M2 12h2M19.07 19.07l-1.41-1.41M4.93 19.07l1.41-1.41"/></svg>,
    users:<svg width={size} height={size} viewBox="0 0 24 24" {...p}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>,
    check:<svg width={size} height={size} viewBox="0 0 24 24" {...p}><polyline points="20 6 9 17 4 12"/></svg>,
    trash:<svg width={size} height={size} viewBox="0 0 24 24" {...p}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>,
    edit:<svg width={size} height={size} viewBox="0 0 24 24" {...p}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
    sun:<svg width={size} height={size} viewBox="0 0 24 24" {...p}><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>,
    moon:<svg width={size} height={size} viewBox="0 0 24 24" {...p}><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>,
    chevron:<svg width={size} height={size} viewBox="0 0 24 24" {...p}><polyline points="6 9 12 15 18 9"/></svg>,
    copy:<svg width={size} height={size} viewBox="0 0 24 24" {...p}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>,
    lock:<svg width={size} height={size} viewBox="0 0 24 24" {...p}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>,
    mail:<svg width={size} height={size} viewBox="0 0 24 24" {...p}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,
    logout:<svg width={size} height={size} viewBox="0 0 24 24" {...p}><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
    eye:<svg width={size} height={size} viewBox="0 0 24 24" {...p}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
    eyeOff:<svg width={size} height={size} viewBox="0 0 24 24" {...p}><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>,
    key:<svg width={size} height={size} viewBox="0 0 24 24" {...p}><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>,
  };
  return icons[name]||null;
};

// ─── INPUT SENHA COM TOGGLE ───────────────────────────────────────────────────
const SenhaInput = ({value, onChange, placeholder="••••••••", style={}, label, lbl}) => {
  const [show, setShow] = useState(false);
  return (
    <div style={{marginBottom:12}}>
      {label && <label style={lbl}>{label}</label>}
      <div style={{position:"relative"}}>
        <input
          type={show?"text":"password"}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          style={{...style,paddingRight:44}}
        />
        <button
          type="button"
          onClick={()=>setShow(!show)}
          style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",padding:4,display:"flex",alignItems:"center",opacity:.6}}
        >
          <Icon name={show?"eyeOff":"eye"} size={18} color="#64748b"/>
        </button>
      </div>
    </div>
  );
};

// ─── BARRA DE FORÇA DE SENHA ──────────────────────────────────────────────────
const ForcaSenhaBar = ({pwd}) => {
  const f = forcaSenha(pwd);
  const cores = ["#ef4444","#f59e0b","#f59e0b","#10b981","#10b981"];
  const labels = ["","Fraca","Razoável","Boa","Forte"];
  if (!pwd) return null;
  return (
    <div style={{marginBottom:12}}>
      <div style={{display:"flex",gap:4,marginBottom:4}}>
        {[1,2,3,4].map(i=>(
          <div key={i} style={{flex:1,height:4,borderRadius:2,background:f>=i?(cores[f-1]):"#e2e8f0",transition:"background .3s"}}/>
        ))}
      </div>
      <div style={{fontSize:11,color:cores[f-1]||"#94a3b8",fontWeight:600}}>{labels[f]||""}</div>
    </div>
  );
};

const BarChart = ({data,textColor}) => {
  const max=Math.max(...data.map(d=>d.value),0.1);
  return (
    <div style={{display:"flex",alignItems:"flex-end",gap:5,height:72}}>
      {data.map((d,i)=>(
        <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
          <div style={{width:"100%",background:"rgba(99,102,241,0.12)",borderRadius:4,height:56,display:"flex",alignItems:"flex-end"}}>
            <div style={{width:"100%",background:d.highlight?"linear-gradient(180deg,#10b981,#059669)":"linear-gradient(180deg,#818cf8,#6366f1)",borderRadius:4,height:`${(d.value/max)*100}%`,minHeight:d.value>0?4:0,transition:"height .5s ease"}}/>
          </div>
          <span style={{fontSize:9,color:d.highlight?"#10b981":textColor,fontWeight:d.highlight?700:600}}>{d.label}</span>
        </div>
      ))}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// APP PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [dark,setDark] = useStorage("hx_dark",false);
  const [tab,setTab] = useState("dashboard");
  const [config,setConfig] = useStorage("hx_config",{
    salario:"",gratificacoes:"",adicionais:"",
    fechamentoPonto:30,fechamentoExtras:15,
    escala:"5x2",jornadaSemanal:JORNADA_DEFAULT,
  });
  const [registros,setRegistros] = useStorage("hx_registros",[]);
  const [feriados,setFeriados] = useStorage("hx_feriados",[]);

  // USUÁRIOS — admin padrão criado automaticamente
  const [usuarios,setUsuarios] = useStorage("hx_usuarios",[{
    id:1, nome:"Administrador", email:"admin@horaextra.app",
    passwordHash: hashPassword("Admin@123"),
    perfil:"admin", status:"ativo",
    mustChangePassword:false,
    createdAt: new Date().toISOString().split("T")[0],
    lastLoginAt:"—"
  }]);

  // SESSÃO
  const [sessao,setSessao] = useState(()=>{
    try {
      const s = JSON.parse(localStorage.getItem(SESSION_KEY));
      if(s && Date.now()-s.loginAt < SESSION_TIMEOUT) return s;
    } catch {}
    return null;
  });

  // TELA AUTH: "login" | "esqueci" | "trocar"
  const [authTela,setAuthTela] = useState("login");

  const login = (usuario) => {
    const sess = {userId:usuario.id, email:usuario.email, nome:usuario.nome, perfil:usuario.perfil, loginAt:Date.now()};
    setSessao(sess);
    localStorage.setItem(SESSION_KEY,JSON.stringify(sess));
    // atualiza lastLoginAt
    setUsuarios(prev=>prev.map(u=>u.id===usuario.id?{...u,lastLoginAt:new Date().toISOString().split("T")[0]}:u));
  };

  const logout = () => {
    setSessao(null);
    localStorage.removeItem(SESSION_KEY);
    setAuthTela("login");
    setTab("dashboard");
  };

  const usuarioAtual = sessao ? usuarios.find(u=>u.id===sessao.userId) : null;

  // Se não autenticado → telas de auth
  if (!sessao || !usuarioAtual) {
    return <AuthFlow dark={dark} setDark={setDark} usuarios={usuarios} setUsuarios={setUsuarios} login={login} authTela={authTela} setAuthTela={setAuthTela}/>;
  }

  // Troca de senha obrigatória
  if (usuarioAtual.mustChangePassword) {
    return <TrocarSenhaObrigatoria dark={dark} usuario={usuarioAtual} usuarios={usuarios} setUsuarios={setUsuarios} logout={logout}/>;
  }

  // App normal
  const jornadaSemanal = config.jornadaSemanal||JORNADA_DEFAULT;
  const baseCalculo = (parseFloat(config.salario)||0)+(parseFloat(config.gratificacoes)||0);
  const totalMinSemana = DIAS_KEYS.reduce((acc,k)=>acc+jornadaDiaria(jornadaSemanal[k]),0);
  const valorHora = totalMinSemana>0 ? baseCalculo/((totalMinSemana*(52/12))/60) : 0;

  const registrosComCalc = registros.map(r=>{
    const dt=new Date(r.data+"T12:00:00");
    const isSpecial=isDomingo(dt)||isFeriadoNacional(dt)||feriados.includes(r.data);
    const dKey=DIAS_KEYS[dt.getDay()];
    const contrato=jornadaDiaria(jornadaSemanal[dKey]);
    const calc=calcDay(r.entrada,r.saida,r.intervalo,contrato,valorHora,isSpecial);
    return {...r,calc,isSpecial,contrato};
  }).sort((a,b)=>a.data.localeCompare(b.data));

  const proximoPagamento = calcularProximoPagamento(registrosComCalc,config.fechamentoExtras);
  const historicoTotal = calcularHistoricoTotal(registrosComCalc);

  const C = {
    bg:dark?"#0f172a":"#f1f5f9",card:dark?"#1e293b":"#ffffff",
    text:dark?"#f1f5f9":"#0f172a",sub:dark?"#94a3b8":"#64748b",
    border:dark?"#334155":"#e2e8f0",input:dark?"#334155":"#f8fafc",
    accent:"#6366f1",green:"#10b981",yellow:"#f59e0b",red:"#ef4444",purple:"#8b5cf6"
  };
  const S = {
    wrap:{minHeight:"100vh",background:C.bg,fontFamily:"'Inter','Segoe UI',system-ui,sans-serif",color:C.text,maxWidth:430,margin:"0 auto",paddingBottom:84,transition:"background .3s,color .3s"},
    card:{background:C.card,borderRadius:16,padding:16,marginBottom:12,border:`1px solid ${C.border}`,boxShadow:dark?"0 4px 24px rgba(0,0,0,.35)":"0 2px 12px rgba(0,0,0,.07)"},
    inp:{background:C.input,border:`1.5px solid ${C.border}`,borderRadius:10,padding:"10px 14px",color:C.text,fontSize:15,width:"100%",outline:"none",boxSizing:"border-box",fontFamily:"inherit"},
    lbl:{fontSize:11,fontWeight:700,color:C.sub,marginBottom:5,display:"block",textTransform:"uppercase",letterSpacing:.7},
    btn:{background:"linear-gradient(135deg,#6366f1,#8b5cf6)",color:"#fff",border:"none",borderRadius:12,padding:"13px",fontSize:15,fontWeight:700,cursor:"pointer",width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:8,fontFamily:"inherit"},
    pill:(a)=>({background:a?C.accent:"transparent",color:a?"#fff":C.sub,border:`1.5px solid ${a?C.accent:C.border}`,borderRadius:20,padding:"6px 14px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",transition:"all .2s"}),
    nav:{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:430,background:C.card,borderTop:`1px solid ${C.border}`,display:"flex",zIndex:99,boxShadow:"0 -4px 20px rgba(0,0,0,.1)"},
    navBtn:(a)=>({flex:1,padding:"10px 4px 8px",display:"flex",flexDirection:"column",alignItems:"center",gap:3,cursor:"pointer",color:a?C.accent:C.sub,fontSize:10,fontWeight:a?700:500,background:"none",border:"none",fontFamily:"inherit",transition:"color .2s"}),
  };

  const props={S,C,dark,config,setConfig,registros,setRegistros,feriados,setFeriados,usuarios,setUsuarios,usuarioAtual,valorHora,registrosComCalc,proximoPagamento,historicoTotal,fmt,fmtDateStr,minToHHMM,calcDay,isDomingo,isFeriadoNacional,jornadaSemanal,jornadaDiaria,DIAS_KEYS,DIAS_SEMANA,TEMPLATES,JORNADA_DEFAULT,logout};

  return (
    <div style={S.wrap}>
      {/* HEADER */}
      <div style={{background:"linear-gradient(135deg,#6366f1,#8b5cf6)",padding:"20px 20px 28px",borderRadius:"0 0 28px 28px",marginBottom:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <div style={{fontSize:10,color:"rgba(255,255,255,.65)",fontWeight:700,letterSpacing:2,textTransform:"uppercase"}}>HoraExtra Pro • CLT</div>
            <div style={{fontSize:22,fontWeight:800,color:"#fff",marginTop:2,letterSpacing:"-.5px"}}>Minha Jornada</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,.65)",marginTop:1}}>Olá, {usuarioAtual.nome.split(" ")[0]} 👋</div>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>setDark(!dark)} style={{background:"rgba(255,255,255,.15)",border:"none",borderRadius:10,padding:9,cursor:"pointer"}}>
              <Icon name={dark?"sun":"moon"} size={18} color="#fff"/>
            </button>
            <button onClick={logout} title="Sair" style={{background:"rgba(255,255,255,.15)",border:"none",borderRadius:10,padding:9,cursor:"pointer"}}>
              <Icon name="logout" size={18} color="#fff"/>
            </button>
          </div>
        </div>
        <div style={{display:"flex",gap:10,marginTop:18}}>
          <div style={{flex:1,background:"rgba(255,255,255,.13)",borderRadius:14,padding:"12px 14px"}}>
            <div style={{fontSize:9,color:"rgba(255,255,255,.7)",fontWeight:700,textTransform:"uppercase",letterSpacing:.5}}>Horas no próximo pgto.</div>
            <div style={{fontSize:20,fontWeight:800,color:"#fff",marginTop:2}}>{minToHHMM(proximoPagamento.extra50+proximoPagamento.extra100)}</div>
            <div style={{fontSize:9,color:"rgba(255,255,255,.55)",marginTop:2}}>{fmtDateStr(proximoPagamento.inicio)} – {fmtDateStr(proximoPagamento.fim)}</div>
          </div>
          <div style={{flex:1,background:"rgba(255,255,255,.13)",borderRadius:14,padding:"12px 14px"}}>
            <div style={{fontSize:9,color:"rgba(255,255,255,.7)",fontWeight:700,textTransform:"uppercase",letterSpacing:.5}}>Valor previsto</div>
            <div style={{fontSize:20,fontWeight:800,color:"#fff",marginTop:2}}>{fmt(proximoPagamento.val50+proximoPagamento.val100)}</div>
            <div style={{fontSize:9,color:"rgba(255,255,255,.55)",marginTop:2}}>+ DSR estimado</div>
          </div>
        </div>
      </div>

      <div style={{padding:"0 16px"}}>
        {tab==="dashboard"&&<Dashboard {...props} BarChart={BarChart}/>}
        {tab==="ponto"&&<Ponto {...props}/>}
        {tab==="relatorio"&&<Relatorio {...props}/>}
        {tab==="config"&&<Config {...props}/>}
        {tab==="usuarios"&&usuarioAtual.perfil==="admin"&&<Usuarios {...props}/>}
        {tab==="usuarios"&&usuarioAtual.perfil!=="admin"&&(
          <div style={{...S.card,textAlign:"center",padding:32}}>
            <div style={{fontSize:32,marginBottom:8}}>🔒</div>
            <div style={{color:C.sub}}>Acesso restrito a administradores.</div>
          </div>
        )}
      </div>

      <div style={S.nav}>
        {[["dashboard","home","Início"],["ponto","plus","Registrar"],["relatorio","chart","Relatório"],["config","settings","Config"],["usuarios","users","Usuários"]].map(([id,icon,lbl])=>(
          <button key={id} style={S.navBtn(tab===id)} onClick={()=>setTab(id)}>
            <Icon name={icon} size={tab===id?22:19}/>
            <span>{lbl}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TELAS DE AUTENTICAÇÃO
// ═══════════════════════════════════════════════════════════════════════════════
function AuthFlow({dark,setDark,usuarios,setUsuarios,login,authTela,setAuthTela}) {
  const bg = dark?"#0f172a":"#f1f5f9";
  const card = dark?"#1e293b":"#ffffff";
  const text = dark?"#f1f5f9":"#0f172a";
  const sub = dark?"#94a3b8":"#64748b";
  const border = dark?"#334155":"#e2e8f0";
  const inp = {background:dark?"#334155":"#f8fafc",border:`1.5px solid ${border}`,borderRadius:10,padding:"12px 14px",color:text,fontSize:15,width:"100%",outline:"none",boxSizing:"border-box",fontFamily:"inherit"};
  const lbl = {fontSize:11,fontWeight:700,color:sub,marginBottom:5,display:"block",textTransform:"uppercase",letterSpacing:.7};
  const btn = {background:"linear-gradient(135deg,#6366f1,#8b5cf6)",color:"#fff",border:"none",borderRadius:12,padding:"14px",fontSize:16,fontWeight:700,cursor:"pointer",width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:8,fontFamily:"inherit"};

  // Hooks SEMPRE no topo, antes de qualquer return condicional
  const [email,setEmail] = useState("");
  const [senha,setSenha] = useState("");
  const [erro,setErro] = useState("");
  const [loading,setLoading] = useState(false);

  if(authTela==="esqueci") return <EsqueciSenha {...{dark,bg,card,text,sub,border,inp,lbl,btn,usuarios,setUsuarios,setAuthTela}}/>;

  const handleLogin = () => {
    setErro(""); setLoading(true);
    setTimeout(()=>{
      setLoading(false);
      const u = usuarios.find(u=>u.email.toLowerCase()===email.toLowerCase());
      if(!u||!checkPassword(senha,u.passwordHash)){setErro("E-mail ou senha incorretos.");return;}
      if(u.status==="inativo"){setErro("Seu acesso está desativado. Entre em contato com o administrador.");return;}
      login(u);
    },600);
  };

  return (
    <div style={{minHeight:"100vh",background:bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:20,fontFamily:"'Inter','Segoe UI',system-ui,sans-serif"}}>
      <div style={{width:"100%",maxWidth:380}}>
        {/* Logo */}
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{width:64,height:64,borderRadius:20,background:"linear-gradient(135deg,#6366f1,#8b5cf6)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 12px",boxShadow:"0 8px 32px rgba(99,102,241,.4)"}}>
            <Icon name="lock" size={28} color="#fff"/>
          </div>
          <div style={{fontSize:24,fontWeight:800,color:text,letterSpacing:"-.5px"}}>HoraExtra Pro</div>
          <div style={{fontSize:13,color:sub,marginTop:4}}>Acesse sua conta para continuar</div>
        </div>

        {/* Card login */}
        <div style={{background:card,borderRadius:20,padding:24,border:`1px solid ${border}`,boxShadow:dark?"0 8px 32px rgba(0,0,0,.4)":"0 4px 24px rgba(0,0,0,.08)"}}>
          <div style={{marginBottom:16}}>
            <label style={lbl}>E-mail</label>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleLogin()} placeholder="seu@email.com" style={inp}/>
          </div>
          <SenhaInput value={senha} onChange={e=>setSenha(e.target.value)} label="Senha" lbl={lbl} style={inp}/>

          {erro && (
            <div style={{background:"#ef444415",border:"1px solid #ef444433",borderRadius:10,padding:"10px 14px",fontSize:13,color:"#ef4444",marginBottom:14,fontWeight:500}}>
              ⚠️ {erro}
            </div>
          )}

          <button onClick={handleLogin} disabled={loading} style={{...btn,opacity:loading?.7:1,marginBottom:14}}>
            {loading?"Verificando...":"Entrar"}
          </button>

          <button onClick={()=>setAuthTela("esqueci")} style={{background:"none",border:"none",color:"#6366f1",fontSize:13,cursor:"pointer",width:"100%",textAlign:"center",fontFamily:"inherit",fontWeight:600}}>
            Esqueci minha senha
          </button>
        </div>

        <div style={{textAlign:"center",marginTop:16,fontSize:11,color:sub}}>
          Acesso padrão: admin@horaextra.app / Admin@123
        </div>

        <button onClick={()=>setDark(!dark)} style={{background:"none",border:`1px solid ${border}`,borderRadius:10,padding:"8px 16px",cursor:"pointer",color:sub,fontSize:12,display:"flex",alignItems:"center",gap:6,margin:"16px auto 0",fontFamily:"inherit"}}>
          <Icon name={dark?"sun":"moon"} size={14} color={sub}/> {dark?"Modo claro":"Modo escuro"}
        </button>
      </div>
    </div>
  );
}

function EsqueciSenha({dark,bg,card,text,sub,border,inp,lbl,btn,usuarios,setUsuarios,setAuthTela}) {
  const [etapa,setEtapa] = useState("email"); // email | nova
  const [email,setEmail] = useState("");
  const [nova,setNova] = useState("");
  const [confirma,setConfirma] = useState("");
  const [erro,setErro] = useState("");
  const [ok,setOk] = useState(false);

  const verificarEmail = () => {
    const u = usuarios.find(u=>u.email.toLowerCase()===email.toLowerCase());
    if(!u){setErro("E-mail não encontrado.");return;}
    if(u.status==="inativo"){setErro("Conta desativada. Contate o administrador.");return;}
    setErro(""); setEtapa("nova");
  };

  const salvarNova = () => {
    const erros = validarSenha(nova);
    if(erros.length>0){setErro(erros[0]);return;}
    if(nova!==confirma){setErro("As senhas não conferem.");return;}
    setUsuarios(prev=>prev.map(u=>u.email.toLowerCase()===email.toLowerCase()?{...u,passwordHash:hashPassword(nova),mustChangePassword:false}:u));
    setOk(true);
    setTimeout(()=>setAuthTela("login"),2000);
  };

  if(ok) return (
    <div style={{minHeight:"100vh",background:bg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"inherit"}}>
      <div style={{textAlign:"center",padding:32}}>
        <div style={{fontSize:48,marginBottom:12}}>✅</div>
        <div style={{fontSize:18,fontWeight:700,color:text}}>Senha atualizada!</div>
        <div style={{fontSize:13,color:sub,marginTop:4}}>Redirecionando para o login...</div>
      </div>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",background:bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:20,fontFamily:"'Inter','Segoe UI',system-ui,sans-serif"}}>
      <div style={{width:"100%",maxWidth:380}}>
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{width:56,height:56,borderRadius:16,background:"linear-gradient(135deg,#6366f1,#8b5cf6)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 12px"}}>
            <Icon name="key" size={24} color="#fff"/>
          </div>
          <div style={{fontSize:20,fontWeight:800,color:text}}>Recuperar senha</div>
          <div style={{fontSize:13,color:sub,marginTop:4}}>{etapa==="email"?"Informe seu e-mail cadastrado":"Crie sua nova senha"}</div>
        </div>

        <div style={{background:card,borderRadius:20,padding:24,border:`1px solid ${border}`,boxShadow:"0 4px 24px rgba(0,0,0,.08)"}}>
          {etapa==="email"?(
            <>
              <div style={{marginBottom:16}}>
                <label style={lbl}>E-mail cadastrado</label>
                <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="seu@email.com" style={inp}/>
              </div>
              {erro&&<div style={{background:"#ef444415",borderRadius:10,padding:"10px 14px",fontSize:13,color:"#ef4444",marginBottom:14}}>⚠️ {erro}</div>}
              <button onClick={verificarEmail} style={btn}>Continuar</button>
            </>
          ):(
            <>
              <SenhaInput value={nova} onChange={e=>setNova(e.target.value)} label="Nova senha" lbl={lbl} style={inp}/>
              <ForcaSenhaBar pwd={nova}/>
              <SenhaInput value={confirma} onChange={e=>setConfirma(e.target.value)} label="Confirmar nova senha" lbl={lbl} style={inp}/>
              {erro&&<div style={{background:"#ef444415",borderRadius:10,padding:"10px 14px",fontSize:13,color:"#ef4444",marginBottom:14}}>⚠️ {erro}</div>}
              <button onClick={salvarNova} style={btn}>Salvar nova senha</button>
            </>
          )}
          <button onClick={()=>setAuthTela("login")} style={{background:"none",border:"none",color:"#6366f1",fontSize:13,cursor:"pointer",width:"100%",textAlign:"center",fontFamily:"inherit",fontWeight:600,marginTop:14}}>
            ← Voltar ao login
          </button>
        </div>
      </div>
    </div>
  );
}

function TrocarSenhaObrigatoria({dark,usuario,usuarios,setUsuarios,logout}) {
  const bg=dark?"#0f172a":"#f1f5f9"; const card=dark?"#1e293b":"#fff"; const text=dark?"#f1f5f9":"#0f172a"; const sub=dark?"#94a3b8":"#64748b"; const border=dark?"#334155":"#e2e8f0";
  const inp={background:dark?"#334155":"#f8fafc",border:`1.5px solid ${border}`,borderRadius:10,padding:"12px 14px",color:text,fontSize:15,width:"100%",outline:"none",boxSizing:"border-box",fontFamily:"inherit"};
  const lbl={fontSize:11,fontWeight:700,color:sub,marginBottom:5,display:"block",textTransform:"uppercase",letterSpacing:.7};
  const [nova,setNova]=useState(""); const [confirma,setConfirma]=useState(""); const [erro,setErro]=useState("");

  const salvar=()=>{
    const erros=validarSenha(nova);
    if(erros.length>0){setErro(erros[0]);return;}
    if(nova===usuario.passwordHash){setErro("A nova senha não pode ser igual à temporária.");return;}
    if(nova!==confirma){setErro("As senhas não conferem.");return;}
    setUsuarios(prev=>prev.map(u=>u.id===usuario.id?{...u,passwordHash:hashPassword(nova),mustChangePassword:false}:u));
  };

  return (
    <div style={{minHeight:"100vh",background:bg,display:"flex",alignItems:"center",justifyContent:"center",padding:20,fontFamily:"'Inter','Segoe UI',system-ui,sans-serif"}}>
      <div style={{width:"100%",maxWidth:380}}>
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{width:56,height:56,borderRadius:16,background:"linear-gradient(135deg,#f59e0b,#ef4444)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 12px"}}>
            <Icon name="key" size={24} color="#fff"/>
          </div>
          <div style={{fontSize:20,fontWeight:800,color:text}}>Altere sua senha</div>
          <div style={{fontSize:13,color:sub,marginTop:4}}>Por segurança, defina uma nova senha antes de continuar.</div>
        </div>

        <div style={{background:card,borderRadius:20,padding:24,border:`1px solid ${border}`,boxShadow:"0 4px 24px rgba(0,0,0,.08)"}}>
          <div style={{background:"#f59e0b15",border:"1px solid #f59e0b33",borderRadius:10,padding:"10px 14px",fontSize:12,color:"#f59e0b",fontWeight:600,marginBottom:16}}>
            🔐 Este é seu primeiro acesso. Crie uma senha pessoal para continuar.
          </div>
          <SenhaInput value={nova} onChange={e=>setNova(e.target.value)} label="Nova senha" lbl={lbl} style={inp}/>
          <ForcaSenhaBar pwd={nova}/>
          <div style={{fontSize:11,color:sub,marginBottom:12}}>
            {["Mínimo 8 caracteres","Pelo menos 1 letra","Pelo menos 1 número"].map(r=>(
              <div key={r} style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
                <div style={{width:6,height:6,borderRadius:3,background:sub}}/>
                {r}
              </div>
            ))}
          </div>
          <SenhaInput value={confirma} onChange={e=>setConfirma(e.target.value)} label="Confirmar nova senha" lbl={lbl} style={inp}/>
          {erro&&<div style={{background:"#ef444415",borderRadius:10,padding:"10px 14px",fontSize:13,color:"#ef4444",marginBottom:14}}>⚠️ {erro}</div>}
          <button onClick={salvar} style={{background:"linear-gradient(135deg,#6366f1,#8b5cf6)",color:"#fff",border:"none",borderRadius:12,padding:"14px",fontSize:15,fontWeight:700,cursor:"pointer",width:"100%",fontFamily:"inherit",marginBottom:12}}>
            Salvar e Entrar
          </button>
          <button onClick={logout} style={{background:"none",border:"none",color:sub,fontSize:13,cursor:"pointer",width:"100%",fontFamily:"inherit"}}>Sair</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════
function Dashboard({S,C,proximoPagamento,historicoTotal,registrosComCalc,config,fmt,fmtDateStr,minToHHMM,BarChart}) {
  const [historicoAberto,setHistoricoAberto]=useState(false);
  const sal=parseFloat(config.salario)||0;
  const totalExt=proximoPagamento.val50+proximoPagamento.val100;
  const dsr=totalExt*.1667;
  const projecao=sal+totalExt+dsr;

  const last8=[...registrosComCalc].slice(-8);
  const chartData=Array.from({length:8},(_,i)=>{
    const r=last8[i];
    const inPeriod=r&&r.data>=proximoPagamento.inicio&&r.data<=proximoPagamento.fim;
    const lbl=r?["D","S","T","Q","Q","S","S"][new Date(r.data+"T12:00:00").getDay()]:["D","S","T","Q","Q","S","S","D"][i];
    return {label:lbl,value:r?.calc?(r.calc.extra50+r.calc.extra100)/60:0,highlight:inPeriod};
  });

  return (
    <div>
      <div style={{...S.card,background:`linear-gradient(135deg,${C.green}15,${C.green}05)`,border:`1.5px solid ${C.green}33`}}>
        <div style={{fontSize:10,color:C.green,fontWeight:700,letterSpacing:.5,marginBottom:10}}>📅 PREVISÃO — PRÓXIMO PAGAMENTO</div>
        <div style={{fontSize:11,color:C.sub,marginBottom:12,background:C.green+"10",borderRadius:8,padding:"6px 10px"}}>
          Período: <b>{fmtDateStr(proximoPagamento.inicio)}</b> a <b>{fmtDateStr(proximoPagamento.fim)}</b>
        </div>
        <div style={{display:"flex",gap:10,marginBottom:12}}>
          <div style={{flex:1,background:C.card,borderRadius:12,padding:"10px 12px",border:`1px solid ${C.border}`}}>
            <div style={{fontSize:10,color:C.sub,fontWeight:700}}>📈 Extras 50%</div>
            <div style={{fontSize:20,fontWeight:800,color:C.yellow,marginTop:3}}>{minToHHMM(proximoPagamento.extra50)}</div>
            <div style={{fontSize:12,color:C.sub,fontWeight:600,marginTop:1}}>{fmt(proximoPagamento.val50)}</div>
          </div>
          <div style={{flex:1,background:C.card,borderRadius:12,padding:"10px 12px",border:`1px solid ${C.border}`}}>
            <div style={{fontSize:10,color:C.sub,fontWeight:700}}>🔥 Extras 100%</div>
            <div style={{fontSize:20,fontWeight:800,color:C.red,marginTop:3}}>{minToHHMM(proximoPagamento.extra100)}</div>
            <div style={{fontSize:12,color:C.sub,fontWeight:600,marginTop:1}}>{fmt(proximoPagamento.val100)}</div>
          </div>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:C.green+"18",borderRadius:10,padding:"10px 14px"}}>
          <div>
            <div style={{fontSize:11,color:C.green,fontWeight:700}}>💰 Valor previsto no contracheque</div>
            <div style={{fontSize:10,color:C.sub,marginTop:1}}>Extras + DSR estimado ({fmt(dsr)})</div>
          </div>
          <div style={{fontSize:22,fontWeight:800,color:C.green}}>{fmt(totalExt+dsr)}</div>
        </div>
      </div>

      <div style={{...S.card,background:C.bg,border:`1.5px solid ${C.accent}33`}}>
        <div style={{fontSize:10,color:C.accent,fontWeight:700,letterSpacing:.5,marginBottom:10}}>💼 PROJEÇÃO DO SALÁRIO COMPLETO</div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:6}}>
          {[[sal,"Salário base",C.text],[totalExt+dsr,"Extras+DSR",C.green],[projecao,"TOTAL PREVISTO",C.accent]].map(([v,l,cor],i)=>(
            <div key={l} style={{flex:1,textAlign:"center",...(i===2?{background:C.accent+"18",borderRadius:12,padding:"8px 4px"}:{})}}>
              <div style={{fontSize:9,color:i===2?C.accent:C.sub,fontWeight:700,textTransform:"uppercase"}}>{l}</div>
              <div style={{fontSize:i===2?17:14,fontWeight:800,color:cor,marginTop:2}}>{fmt(v)}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={S.card}>
        <div style={{fontSize:13,fontWeight:700,marginBottom:2}}>📊 Horas extras por dia</div>
        <div style={{fontSize:10,color:C.sub,marginBottom:8}}>Verde = período do próximo pagamento</div>
        <BarChart data={chartData} textColor={C.sub}/>
      </div>

      <div style={S.card}>
        <div style={{fontSize:13,fontWeight:700,marginBottom:10}}>🔢 Reflexos Estimados</div>
        {[["DSR s/ extras",dsr,C.yellow],["Férias + 1/3",(sal+totalExt)/12*(4/3),C.green],["13º Salário",(sal+totalExt)/12,C.accent],["FGTS 8%",projecao*.08,C.purple]].map(([l,v,cor])=>(
          <div key={l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${C.border}`}}>
            <span style={{fontSize:13,color:C.sub}}>{l}</span>
            <span style={{fontSize:14,fontWeight:700,color:cor}}>{fmt(v)}</span>
          </div>
        ))}
      </div>

      <div style={{...S.card,cursor:"pointer"}} onClick={()=>setHistoricoAberto(!historicoAberto)}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:13,fontWeight:700}}>📁 Histórico Total</div>
            <div style={{fontSize:11,color:C.sub,marginTop:2}}>Todos os registros</div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:14,fontWeight:700,color:C.sub}}>{fmt(historicoTotal.val50+historicoTotal.val100)}</span>
            <div style={{transform:historicoAberto?"rotate(180deg)":"none",transition:"transform .3s"}}><Icon name="chevron" size={18} color={C.sub}/></div>
          </div>
        </div>
        {historicoAberto&&(
          <div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${C.border}`}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              {[["Extras 50%",minToHHMM(historicoTotal.extra50),fmt(historicoTotal.val50),C.yellow],["Extras 100%",minToHHMM(historicoTotal.extra100),fmt(historicoTotal.val100),C.red],["Total horas",minToHHMM(historicoTotal.worked),"",C.sub],["Total valor","",fmt(historicoTotal.val50+historicoTotal.val100),C.green]].map(([l,h,v,c])=>(
                <div key={l} style={{background:C.bg,borderRadius:10,padding:"9px 12px",border:`1px solid ${C.border}`}}>
                  <div style={{fontSize:10,color:C.sub,fontWeight:600}}>{l}</div>
                  <div style={{fontSize:14,fontWeight:700,color:c,marginTop:2}}>{h||v}</div>
                  {h&&v&&<div style={{fontSize:11,color:C.sub}}>{v}</div>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PONTO
// ═══════════════════════════════════════════════════════════════════════════════
function Ponto({S,C,registros,setRegistros,feriados,config,valorHora,fmt,fmtDateStr,minToHHMM,calcDay,isDomingo,isFeriadoNacional,jornadaSemanal,jornadaDiaria,DIAS_KEYS,DIAS_SEMANA,proximoPagamento}) {
  const today=new Date().toISOString().split("T")[0];
  const VAZIO={data:today,entrada:"",saida:"",intervalo:"60",obs:""};
  const [form,setForm]=useState(VAZIO);
  const [preview,setPreview]=useState(null);
  const [editando,setEditando]=useState(null);

  const recalc=(f)=>{
    const dt=new Date(f.data+"T12:00:00");
    const isSp=isDomingo(dt)||isFeriadoNacional(dt)||feriados.includes(f.data);
    const contrato=jornadaDiaria(jornadaSemanal[DIAS_KEYS[dt.getDay()]]);
    const c=calcDay(f.entrada,f.saida,f.intervalo,contrato,valorHora,isSp);
    setPreview(c?{...c,isSpecial:isSp,contrato}:null);
  };

  const upd=(k,v)=>{const nf={...form,[k]:v};setForm(nf);recalc(nf);};

  const iniciarEdicao=(r)=>{
    setForm({data:r.data,entrada:r.entrada,saida:r.saida,intervalo:r.intervalo||"60",obs:r.obs||""});
    setEditando(r.data);
    const dt=new Date(r.data+"T12:00:00");
    const isSp=isDomingo(dt)||isFeriadoNacional(dt)||feriados.includes(r.data);
    const contrato=jornadaDiaria(jornadaSemanal[DIAS_KEYS[dt.getDay()]]);
    const c=calcDay(r.entrada,r.saida,r.intervalo,contrato,valorHora,isSp);
    setPreview(c?{...c,isSpecial:isSp,contrato}:null);
    window.scrollTo({top:0,behavior:"smooth"});
  };

  const save=()=>{
    if(!form.entrada||!form.saida){alert("Preencha entrada e saída!");return;}
    if(editando){setRegistros(registros.map(r=>r.data===editando?{...form}:r));setEditando(null);}
    else{const idx=registros.findIndex(r=>r.data===form.data);if(idx>=0){const u=[...registros];u[idx]={...form};setRegistros(u);}else setRegistros([...registros,{...form}]);}
    setForm(VAZIO);setPreview(null);
  };

  return (
    <div>
      <div style={{...S.card,border:editando?`2px solid ${C.yellow}`:undefined}}>
        <div style={{fontSize:13,fontWeight:700,color:editando?C.yellow:C.accent,marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span>{editando?"✏️ EDITANDO":"⏱️ NOVO REGISTRO"}</span>
          {editando&&<button onClick={()=>{setForm(VAZIO);setEditando(null);setPreview(null);}} style={{background:C.border,border:"none",borderRadius:8,padding:"4px 10px",cursor:"pointer",fontSize:12,color:C.sub}}>Cancelar</button>}
        </div>
        <div style={{marginBottom:12}}>
          <label style={S.lbl}>Data</label>
          <input type="date" value={form.data} onChange={e=>upd("data",e.target.value)} style={S.inp} disabled={!!editando}/>
          <div style={{fontSize:11,color:C.sub,marginTop:4}}>{DIAS_SEMANA[new Date(form.data+"T12:00:00").getDay()]} · Contrato: {minToHHMM(jornadaDiaria(jornadaSemanal[DIAS_KEYS[new Date(form.data+"T12:00:00").getDay()]]))}</div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
          <div><label style={S.lbl}>Entrada</label><input type="time" value={form.entrada} onChange={e=>upd("entrada",e.target.value)} style={S.inp}/></div>
          <div><label style={S.lbl}>Saída</label><input type="time" value={form.saida} onChange={e=>upd("saida",e.target.value)} style={S.inp}/></div>
        </div>
        <div style={{marginBottom:12}}>
          <label style={S.lbl}>Intervalo (min)</label>
          <input type="number" value={form.intervalo} onChange={e=>upd("intervalo",e.target.value)} style={S.inp}/>
        </div>
        <div style={{marginBottom:14}}>
          <label style={S.lbl}>Observação</label>
          <input type="text" value={form.obs} onChange={e=>upd("obs",e.target.value)} placeholder="Ex: extra autorizada" style={S.inp}/>
        </div>
        {preview&&(
          <div style={{background:C.bg,borderRadius:12,padding:14,marginBottom:14,border:`1px solid ${C.border}`}}>
            <div style={{fontSize:10,fontWeight:700,color:C.sub,letterSpacing:.5,marginBottom:10}}>PRÉ-VISUALIZAÇÃO</div>
            {preview.isSpecial&&<div style={{background:C.red+"15",color:C.red,borderRadius:8,padding:"7px 10px",fontSize:12,fontWeight:600,marginBottom:10}}>⚠️ Domingo/Feriado — 100% automático</div>}
            {preview.alerteLimite&&<div style={{background:C.yellow+"15",color:C.yellow,borderRadius:8,padding:"7px 10px",fontSize:12,fontWeight:600,marginBottom:10}}>⚠️ Excedeu 2h extras. Verifique com seu gestor.</div>}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
              {[["⏳ Trabalhado",minToHHMM(preview.worked),C.text],["📌 Contrato",minToHHMM(preview.contrato),C.sub],["📈 Extra 50%",minToHHMM(preview.extra50),C.yellow],["🔥 Extra 100%",minToHHMM(preview.extra100),C.red]].map(([l,v,c])=>(
                <div key={l} style={{background:C.card,borderRadius:8,padding:"9px 10px",border:`1px solid ${C.border}`}}>
                  <div style={{fontSize:10,color:C.sub,fontWeight:600}}>{l}</div>
                  <div style={{fontSize:16,fontWeight:700,color:c,marginTop:2}}>{v}</div>
                </div>
              ))}
            </div>
            {preview.delay>0&&<div style={{background:C.yellow+"15",borderRadius:8,padding:"7px 10px",fontSize:12,color:C.yellow,fontWeight:600,marginBottom:10}}>⏰ Atraso: {minToHHMM(preview.delay)}</div>}
            <div style={{background:C.green+"15",borderRadius:10,padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:12,fontWeight:700,color:C.green}}>💵 Valor a receber</span>
              <span style={{fontSize:22,fontWeight:800,color:C.green}}>{fmt(preview.total)}</span>
            </div>
          </div>
        )}
        <button onClick={save} style={S.btn}><Icon name="check" size={18} color="#fff"/>{editando?"Salvar Edição":"Salvar Registro"}</button>
      </div>

      <div style={S.card}>
        <div style={{fontSize:13,fontWeight:700,marginBottom:12}}>📋 Histórico ({registros.length})</div>
        {registros.length===0&&<div style={{textAlign:"center",padding:16,color:C.sub,fontSize:13}}>Sem registros.</div>}
        {[...registros].sort((a,b)=>b.data.localeCompare(a.data)).map((r,i)=>{
          const dt=new Date(r.data+"T12:00:00");
          const isSp=isDomingo(dt)||isFeriadoNacional(dt)||feriados.includes(r.data);
          const contrato=jornadaDiaria(jornadaSemanal[DIAS_KEYS[dt.getDay()]]);
          const c=calcDay(r.entrada,r.saida,r.intervalo,contrato,valorHora,isSp);
          const noPeriodo=r.data>=proximoPagamento.inicio&&r.data<=proximoPagamento.fim;
          return (
            <div key={i} style={{padding:"10px 0",borderBottom:`1px solid ${C.border}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                    <span style={{fontSize:13,fontWeight:600}}>{fmtDateStr(r.data)}</span>
                    {noPeriodo&&<span style={{background:C.green+"22",color:C.green,borderRadius:5,padding:"1px 6px",fontSize:10,fontWeight:700}}>Próx. pgto.</span>}
                    {isSp&&<span style={{background:C.red+"22",color:C.red,borderRadius:5,padding:"1px 6px",fontSize:10,fontWeight:700}}>FERIADO</span>}
                    {c?.alerteLimite&&<span style={{background:C.yellow+"22",color:C.yellow,borderRadius:5,padding:"1px 6px",fontSize:10,fontWeight:700}}>+2h</span>}
                  </div>
                  <div style={{fontSize:11,color:C.sub,marginTop:1}}>{r.entrada} → {r.saida} · {minToHHMM(contrato)}</div>
                  {r.obs&&<div style={{fontSize:11,color:C.sub,fontStyle:"italic"}}>"{r.obs}"</div>}
                </div>
                <div style={{textAlign:"right"}}>
                  {c&&<div style={{fontSize:14,fontWeight:700,color:C.green}}>{fmt(c.total)}</div>}
                  {c&&<div style={{fontSize:10,color:C.sub}}>{minToHHMM(c.extra50+c.extra100)} ext.</div>}
                </div>
              </div>
              <div style={{display:"flex",gap:8,marginTop:8}}>
                <button onClick={()=>iniciarEdicao(r)} style={{flex:1,background:"none",border:`1px solid ${C.border}`,borderRadius:8,padding:"6px",cursor:"pointer",color:C.accent,fontSize:12,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>
                  <Icon name="edit" size={13} color={C.accent}/> Editar
                </button>
                <button onClick={()=>setRegistros(registros.filter(x=>x.data!==r.data))} style={{flex:1,background:"none",border:`1px solid ${C.red}33`,borderRadius:8,padding:"6px",cursor:"pointer",color:C.red,fontSize:12,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>
                  <Icon name="trash" size={13} color={C.red}/> Excluir
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// RELATÓRIO
// ═══════════════════════════════════════════════════════════════════════════════
function Relatorio({S,C,registrosComCalc,proximoPagamento,historicoTotal,config,valorHora,fmt,fmtDateStr,minToHHMM}) {
  const sal=parseFloat(config.salario)||0;
  const totalExt=proximoPagamento.val50+proximoPagamento.val100;
  const dsr=totalExt*.1667;
  const byMonth={};
  registrosComCalc.forEach(r=>{
    const m=r.data.substring(0,7);
    if(!byMonth[m]) byMonth[m]={extra50:0,extra100:0,val50:0,val100:0,worked:0,days:0,alertas:0};
    if(r.calc){byMonth[m].extra50+=r.calc.extra50;byMonth[m].extra100+=r.calc.extra100;byMonth[m].val50+=r.calc.val50;byMonth[m].val100+=r.calc.val100;byMonth[m].worked+=r.calc.worked;byMonth[m].days++;if(r.calc.alerteLimite)byMonth[m].alertas++;}
  });
  const months=Object.entries(byMonth).sort((a,b)=>b[0].localeCompare(a[0]));

  const exportTxt=()=>{
    let t="===== RELATÓRIO HORA EXTRA PRO =====\n";
    t+=`Data: ${new Date().toLocaleDateString("pt-BR")}\n`;
    t+=`Salário Base: ${fmt(sal)} | Valor/hora: ${fmt(valorHora)}\n\n`;
    t+=`===== PRÓXIMO PAGAMENTO (${fmtDateStr(proximoPagamento.inicio)} a ${fmtDateStr(proximoPagamento.fim)}) =====\n`;
    t+=`Extras 50%: ${minToHHMM(proximoPagamento.extra50)} = ${fmt(proximoPagamento.val50)}\n`;
    t+=`Extras 100%: ${minToHHMM(proximoPagamento.extra100)} = ${fmt(proximoPagamento.val100)}\n`;
    t+=`DSR: ${fmt(dsr)} | TOTAL PREVISTO: ${fmt(totalExt+dsr)}\n\n`;
    months.forEach(([m,d])=>{
      t+=`\n${new Date(m+"-15").toLocaleDateString("pt-BR",{month:"long",year:"numeric"})}\n`;
      t+=`  Dias: ${d.days} | E50: ${minToHHMM(d.extra50)} | E100: ${minToHHMM(d.extra100)}\n`;
      t+=`  Valor: ${fmt(d.val50+d.val100)}${d.alertas>0?` | ⚠️ ${d.alertas} alerta(s)`:""}\n`;
    });
    const blob=new Blob([t],{type:"text/plain;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=url;a.download="relatorio_horas_extras.txt";a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div style={{...S.card,background:`linear-gradient(135deg,${C.green}15,${C.green}05)`,border:`1.5px solid ${C.green}33`}}>
        <div style={{fontSize:10,color:C.green,fontWeight:700,letterSpacing:.5,marginBottom:6}}>💰 PRÓXIMO PAGAMENTO</div>
        <div style={{fontSize:11,color:C.sub,marginBottom:10,background:C.green+"10",borderRadius:8,padding:"5px 10px"}}>
          Período: <b>{fmtDateStr(proximoPagamento.inicio)}</b> a <b>{fmtDateStr(proximoPagamento.fim)}</b>
        </div>
        {[["📈 Extras 50%",minToHHMM(proximoPagamento.extra50),fmt(proximoPagamento.val50),C.yellow],["🔥 Extras 100%",minToHHMM(proximoPagamento.extra100),fmt(proximoPagamento.val100),C.red],["📅 DSR estimado","—",fmt(dsr),C.accent],["💰 VALOR PREVISTO",minToHHMM(proximoPagamento.extra50+proximoPagamento.extra100),fmt(totalExt+dsr),C.green]].map(([l,h,v,c],i)=>(
          <div key={l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${C.border}`}}>
            <div>
              <div style={{fontSize:i===3?14:13,fontWeight:i===3?700:500,color:i===3?c:C.text}}>{l}</div>
              <div style={{fontSize:11,color:C.sub}}>{h}</div>
            </div>
            <span style={{fontSize:i===3?20:15,fontWeight:700,color:c}}>{v}</span>
          </div>
        ))}
      </div>

      {months.map(([m,d])=>(
        <div key={m} style={S.card}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:10}}>
            {new Date(m+"-15").toLocaleDateString("pt-BR",{month:"long",year:"numeric"}).replace(/^\w/,c=>c.toUpperCase())}
            {d.alertas>0&&<span style={{background:C.yellow+"22",color:C.yellow,borderRadius:6,padding:"1px 8px",fontSize:11,fontWeight:700,marginLeft:8}}>⚠️ {d.alertas}</span>}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
            {[["Dias",d.days+"d",C.text],["Total",minToHHMM(d.worked),C.text],["Extra 50%",fmt(d.val50),C.yellow],["Extra 100%",fmt(d.val100),C.red]].map(([l,v,c])=>(
              <div key={l} style={{background:C.bg,borderRadius:10,padding:"9px 12px",border:`1px solid ${C.border}`}}>
                <div style={{fontSize:10,color:C.sub,fontWeight:600}}>{l}</div>
                <div style={{fontSize:14,fontWeight:700,color:c,marginTop:2}}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{background:C.green+"15",borderRadius:10,padding:"9px 14px",display:"flex",justifyContent:"space-between"}}>
            <span style={{fontSize:12,fontWeight:700,color:C.green}}>Total do mês</span>
            <span style={{fontSize:18,fontWeight:800,color:C.green}}>{fmt(d.val50+d.val100)}</span>
          </div>
        </div>
      ))}

      {months.length===0&&<div style={{...S.card,textAlign:"center",padding:32,color:C.sub}}><div style={{fontSize:36,marginBottom:8}}>📊</div>Sem dados.</div>}

      <div style={S.card}>
        <div style={{fontSize:13,fontWeight:700,marginBottom:12}}>📤 Exportar</div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <button onClick={exportTxt} style={S.btn}>📄 Baixar Relatório (.txt)</button>
          <button onClick={()=>{const msg=`*HORA EXTRA PRO — PRÓXIMO PAGAMENTO*\n\nPeríodo: ${fmtDateStr(proximoPagamento.inicio)} a ${fmtDateStr(proximoPagamento.fim)}\n\nExtras 50%: ${minToHHMM(proximoPagamento.extra50)} = ${fmt(proximoPagamento.val50)}\nExtras 100%: ${minToHHMM(proximoPagamento.extra100)} = ${fmt(proximoPagamento.val100)}\nDSR: ${fmt(dsr)}\n\n*💰 VALOR PREVISTO: ${fmt(totalExt+dsr)}*`;window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`,"_blank");}} style={{...S.btn,background:"linear-gradient(135deg,#25D366,#128C7E)"}}>📱 Compartilhar via WhatsApp</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════════════════════
function Config({S,C,config,setConfig,feriados,setFeriados,jornadaSemanal,jornadaDiaria,DIAS_KEYS,DIAS_SEMANA,TEMPLATES,minToHHMM}) {
  const [novoF,setNovoF]=useState("");
  const upd=(k,v)=>setConfig({...config,[k]:v});
  const updJ=(dKey,field,value)=>setConfig({...config,jornadaSemanal:{...jornadaSemanal,[dKey]:{...jornadaSemanal[dKey],[field]:value}}});
  const totalSemanMin=DIAS_KEYS.reduce((acc,k)=>acc+jornadaDiaria(jornadaSemanal[k]),0);
  const diasAtivos=DIAS_KEYS.filter(k=>jornadaSemanal[k]?.ativo).length;
  const sal=(parseFloat(config.salario)||0)+(parseFloat(config.gratificacoes)||0);
  const vh=totalSemanMin>0?sal/((totalSemanMin*(52/12))/60):0;
  const copiar=(dKey)=>{const f=jornadaSemanal[dKey];const n={...jornadaSemanal};DIAS_KEYS.forEach(k=>{if(k!==dKey)n[k]={...n[k],entrada:f.entrada,saida:f.saida,intervalo:f.intervalo};});setConfig({...config,jornadaSemanal:n});};

  return (
    <div>
      <div style={S.card}>
        <div style={{fontSize:13,fontWeight:700,color:C.accent,marginBottom:14}}>💼 CADASTRO SALARIAL</div>
        {[["Salário Base (R$)","salario"],["Gratificações (R$)","gratificacoes"],["Adicionais Fixos (R$)","adicionais"]].map(([l,k])=>(
          <div key={k} style={{marginBottom:12}}>
            <label style={S.lbl}>{l}</label>
            <input type="number" value={config[k]} onChange={e=>upd(k,e.target.value)} placeholder="0,00" style={S.inp}/>
          </div>
        ))}
        <div style={{background:C.green+"12",borderRadius:12,padding:14,border:`1.5px solid ${C.green}33`}}>
          <div style={{fontSize:10,color:C.sub,fontWeight:700,letterSpacing:.5}}>VALOR DA HORA</div>
          <div style={{fontSize:26,fontWeight:800,color:C.green,marginTop:4}}>{vh>0?`R$ ${vh.toFixed(2)}/h`:"Configure →"}</div>
          {vh>0&&<div style={{fontSize:12,color:C.yellow,marginTop:4,fontWeight:600}}>📈 50%: R$ {(vh*1.5).toFixed(2)}/h · 🔥 100%: R$ {(vh*2).toFixed(2)}/h</div>}
        </div>
      </div>

      <div style={S.card}>
        <div style={{fontSize:13,fontWeight:700,color:C.accent,marginBottom:10}}>⏱️ JORNADA POR DIA</div>
        <div style={{marginBottom:12}}>
          <div style={{fontSize:11,color:C.sub,fontWeight:700,marginBottom:8}}>TEMPLATES</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
            {Object.keys(TEMPLATES).map(t=><button key={t} onClick={()=>setConfig({...config,jornadaSemanal:TEMPLATES[t]})} style={{...S.pill(false),fontSize:11}}>{t}</button>)}
          </div>
        </div>
        <div style={{background:C.accent+"12",borderRadius:10,padding:"10px 14px",marginBottom:12,border:`1px solid ${C.accent}33`,display:"flex",justifyContent:"space-between"}}>
          <div><div style={{fontSize:10,color:C.sub,fontWeight:600}}>TOTAL/SEM</div><div style={{fontSize:16,fontWeight:800,color:C.accent}}>{minToHHMM(totalSemanMin)}</div></div>
          <div><div style={{fontSize:10,color:C.sub,fontWeight:600}}>DIAS ATIVOS</div><div style={{fontSize:16,fontWeight:800,color:C.accent}}>{diasAtivos}</div></div>
          <div><div style={{fontSize:10,color:C.sub,fontWeight:600}}>MÉDIA/DIA</div><div style={{fontSize:16,fontWeight:800,color:C.accent}}>{minToHHMM(diasAtivos>0?Math.round(totalSemanMin/diasAtivos):0)}</div></div>
        </div>
        {DIAS_KEYS.map((dKey,i)=>{
          const dia=jornadaSemanal[dKey]||{ativo:false,entrada:"08:00",saida:"17:00",intervalo:60};
          const liq=jornadaDiaria(dia);
          return (
            <div key={dKey} style={{background:C.bg,borderRadius:12,padding:12,marginBottom:8,border:`1.5px solid ${dia.ativo?C.accent+"44":C.border}`,opacity:dia.ativo?1:0.6}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:dia.ativo?10:0}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <button onClick={()=>updJ(dKey,"ativo",!dia.ativo)} style={{width:40,height:22,borderRadius:11,background:dia.ativo?C.accent:C.border,border:"none",cursor:"pointer",position:"relative",transition:"background .2s"}}>
                    <div style={{width:18,height:18,borderRadius:9,background:"#fff",position:"absolute",top:2,left:dia.ativo?20:2,transition:"left .2s"}}/>
                  </button>
                  <span style={{fontSize:14,fontWeight:700}}>{DIAS_SEMANA[i]}</span>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  {dia.ativo?<span style={{fontSize:12,fontWeight:700,color:C.green}}>{minToHHMM(liq)}</span>:<span style={{fontSize:12,color:C.sub}}>Folga</span>}
                  {dia.ativo&&<button onClick={()=>copiar(dKey)} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:7,padding:"3px 7px",cursor:"pointer",color:C.sub,fontSize:10,display:"flex",alignItems:"center",gap:3}}><Icon name="copy" size={11} color={C.sub}/>copiar</button>}
                </div>
              </div>
              {dia.ativo&&(
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 80px",gap:8}}>
                  <div><div style={{fontSize:9,color:C.sub,fontWeight:700,marginBottom:4}}>ENTRADA</div><input type="time" value={dia.entrada} onChange={e=>updJ(dKey,"entrada",e.target.value)} style={{...S.inp,padding:"7px 10px",fontSize:13}}/></div>
                  <div><div style={{fontSize:9,color:C.sub,fontWeight:700,marginBottom:4}}>SAÍDA</div><input type="time" value={dia.saida} onChange={e=>updJ(dKey,"saida",e.target.value)} style={{...S.inp,padding:"7px 10px",fontSize:13}}/></div>
                  <div><div style={{fontSize:9,color:C.sub,fontWeight:700,marginBottom:4}}>INTERVALO</div><input type="number" value={dia.intervalo} onChange={e=>updJ(dKey,"intervalo",parseInt(e.target.value)||0)} style={{...S.inp,padding:"7px 10px",fontSize:13}}/></div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={S.card}>
        <div style={{fontSize:13,fontWeight:700,color:C.accent,marginBottom:14}}>📅 FECHAMENTO</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
          <div><label style={S.lbl}>Ponto fecha dia</label><input type="number" min="1" max="31" value={config.fechamentoPonto} onChange={e=>upd("fechamentoPonto",parseInt(e.target.value)||30)} style={S.inp}/></div>
          <div><label style={S.lbl}>Extras fecham dia</label><input type="number" min="1" max="31" value={config.fechamentoExtras} onChange={e=>upd("fechamentoExtras",parseInt(e.target.value)||15)} style={S.inp}/></div>
        </div>
      </div>

      <div style={S.card}>
        <div style={{fontSize:13,fontWeight:700,color:C.accent,marginBottom:6}}>🗓️ FERIADOS LOCAIS</div>
        <div style={{display:"flex",gap:8,marginBottom:12}}>
          <input type="date" value={novoF} onChange={e=>setNovoF(e.target.value)} style={{...S.inp,flex:1}}/>
          <button onClick={()=>{if(novoF&&!feriados.includes(novoF)){setFeriados([...feriados,novoF]);setNovoF("");}}} style={{background:C.accent,border:"none",borderRadius:10,padding:"0 14px",cursor:"pointer",display:"flex",alignItems:"center",height:44}}>
            <Icon name="plus" size={18} color="#fff"/>
          </button>
        </div>
        {[...feriados].sort().map(d=>(
          <div key={d} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${C.border}`}}>
            <span style={{fontSize:13}}>{new Date(d+"T12:00:00").toLocaleDateString("pt-BR",{weekday:"short",day:"2-digit",month:"long"})}</span>
            <button onClick={()=>setFeriados(feriados.filter(f=>f!==d))} style={{background:"none",border:"none",cursor:"pointer",padding:4}}><Icon name="trash" size={15} color={C.red}/></button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// USUÁRIOS
// ═══════════════════════════════════════════════════════════════════════════════
function Usuarios({S,C,usuarios,setUsuarios}) {
  const [view,setView]=useState("lista");
  const [editId,setEditId]=useState(null);
  const [form,setForm]=useState({nome:"",email:"",senha:"",perfil:"usuario",status:"ativo"});
  const [filtro,setFiltro]=useState("");
  const [resetando,setResetando]=useState(null);
  const [novaSenhaReset,setNovaSenhaReset]=useState("");
  const [erroForm,setErroForm]=useState("");
  const upd=(k,v)=>setForm(f=>({...f,[k]:v}));

  const save=()=>{
    setErroForm("");
    if(!form.nome||!form.email){setErroForm("Nome e e-mail obrigatórios!");return;}
    if(!editId&&!form.senha){setErroForm("Informe a senha temporária.");return;}
    if(form.senha){const e=validarSenha(form.senha);if(e.length>0){setErroForm(e[0]);return;}}
    if(editId){
      setUsuarios(prev=>prev.map(u=>u.id===editId?{...u,nome:form.nome,email:form.email,perfil:form.perfil,status:form.status,...(form.senha?{passwordHash:hashPassword(form.senha),mustChangePassword:true}:{})}:u));
    } else {
      const emailExiste=usuarios.find(u=>u.email.toLowerCase()===form.email.toLowerCase());
      if(emailExiste){setErroForm("E-mail já cadastrado.");return;}
      setUsuarios(prev=>[...prev,{id:Date.now(),nome:form.nome,email:form.email,passwordHash:hashPassword(form.senha),perfil:form.perfil,status:form.status,mustChangePassword:true,createdAt:new Date().toISOString().split("T")[0],lastLoginAt:"—"}]);
    }
    setForm({nome:"",email:"",senha:"",perfil:"usuario",status:"ativo"});setEditId(null);setView("lista");
  };

  const editar=(u)=>{setForm({nome:u.nome,email:u.email,senha:"",perfil:u.perfil,status:u.status});setEditId(u.id);setErroForm("");setView("form");};
  const excluir=(id)=>setUsuarios(prev=>prev.filter(u=>u.id!==id));
  const toggleStatus=(id)=>setUsuarios(prev=>prev.map(u=>u.id===id?{...u,status:u.status==="ativo"?"inativo":"ativo"}:u));

  const confirmarReset=()=>{
    const e=validarSenha(novaSenhaReset);
    if(e.length>0){alert(e[0]);return;}
    setUsuarios(prev=>prev.map(u=>u.id===resetando?{...u,passwordHash:hashPassword(novaSenhaReset),mustChangePassword:true}:u));
    setResetando(null);setNovaSenhaReset("");
    alert("Senha redefinida! O usuário será obrigado a trocar no próximo login.");
  };

  const filtrados=usuarios.filter(u=>u.nome.toLowerCase().includes(filtro.toLowerCase())||u.email.toLowerCase().includes(filtro.toLowerCase()));

  // Modal reset
  if(resetando) return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:999,padding:20}}>
      <div style={{background:C.card,borderRadius:20,padding:24,width:"100%",maxWidth:360,border:`1px solid ${C.border}`}}>
        <div style={{fontSize:15,fontWeight:700,marginBottom:4}}>🔑 Redefinir Senha</div>
        <div style={{fontSize:12,color:C.sub,marginBottom:16}}>O usuário será obrigado a trocar no próximo login.</div>
        <SenhaInput value={novaSenhaReset} onChange={e=>setNovaSenhaReset(e.target.value)} label="Nova senha temporária" lbl={S.lbl} style={S.inp}/>
        <ForcaSenhaBar pwd={novaSenhaReset}/>
        <div style={{display:"flex",gap:10,marginTop:8}}>
          <button onClick={()=>{setResetando(null);setNovaSenhaReset("");}} style={{...S.btn,background:C.border,color:C.text,flex:1}}>Cancelar</button>
          <button onClick={confirmarReset} style={{...S.btn,flex:2}}>Confirmar</button>
        </div>
      </div>
    </div>
  );

  if(view==="form") return (
    <div>
      <div style={S.card}>
        <div style={{fontSize:13,fontWeight:700,color:C.accent,marginBottom:14}}>{editId?"✏️ EDITAR USUÁRIO":"👤 NOVO USUÁRIO"}</div>
        {[["Nome completo","nome","text"],["E-mail","email","email"]].map(([l,k,t])=>(
          <div key={k} style={{marginBottom:12}}>
            <label style={S.lbl}>{l}</label>
            <input type={t} value={form[k]} onChange={e=>upd(k,e.target.value)} style={S.inp}/>
          </div>
        ))}
        <SenhaInput value={form.senha} onChange={e=>upd("senha",e.target.value)} label={editId?"Nova senha temporária (deixe vazio para não alterar)":"Senha temporária *"} lbl={S.lbl} style={S.inp}/>
        {form.senha&&<ForcaSenhaBar pwd={form.senha}/>}
        <div style={{marginBottom:12}}>
          <label style={S.lbl}>Perfil</label>
          <div style={{display:"flex",gap:8}}>
            {["admin","usuario"].map(p=><button key={p} onClick={()=>upd("perfil",p)} style={{...S.pill(form.perfil===p),flex:1}}>{p==="admin"?"🔑 Administrador":"👤 Usuário"}</button>)}
          </div>
        </div>
        <div style={{marginBottom:16}}>
          <label style={S.lbl}>Status</label>
          <div style={{display:"flex",gap:8}}>
            {["ativo","inativo"].map(st=><button key={st} onClick={()=>upd("status",st)} style={{...S.pill(form.status===st),flex:1}}>{st==="ativo"?"✅ Ativo":"🚫 Inativo"}</button>)}
          </div>
        </div>
        {erroForm&&<div style={{background:"#ef444415",borderRadius:10,padding:"10px 14px",fontSize:13,color:"#ef4444",marginBottom:14}}>⚠️ {erroForm}</div>}
        <div style={{fontSize:11,color:C.sub,marginBottom:14,background:C.yellow+"15",borderRadius:8,padding:"8px 12px"}}>
          ℹ️ O usuário será obrigado a trocar a senha temporária no primeiro login.
        </div>
        <div style={{display:"flex",gap:10}}>
          <button onClick={()=>{setView("lista");setEditId(null);setErroForm("");}} style={{...S.btn,background:C.border,color:C.text,flex:1}}>Cancelar</button>
          <button onClick={save} style={{...S.btn,flex:2}}><Icon name="check" size={18} color="#fff"/>Salvar</button>
        </div>
      </div>
    </div>
  );

  return (
    <div>
      <div style={S.card}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div style={{fontSize:13,fontWeight:700,color:C.accent}}>👥 USUÁRIOS ({usuarios.length})</div>
          <button onClick={()=>{setForm({nome:"",email:"",senha:"",perfil:"usuario",status:"ativo"});setEditId(null);setErroForm("");setView("form");}} style={{background:C.accent,border:"none",borderRadius:10,padding:"8px 14px",cursor:"pointer",color:"#fff",fontSize:13,fontWeight:700,display:"flex",alignItems:"center",gap:6}}>
            <Icon name="plus" size={15} color="#fff"/>Novo
          </button>
        </div>
        <input type="text" value={filtro} onChange={e=>setFiltro(e.target.value)} placeholder="Buscar por nome ou e-mail..." style={{...S.inp,marginBottom:14}}/>
        <div style={{display:"flex",gap:8,marginBottom:14}}>
          {[["Total",usuarios.length,C.accent],["Ativos",usuarios.filter(u=>u.status==="ativo").length,C.green],["Admins",usuarios.filter(u=>u.perfil==="admin").length,C.purple]].map(([l,v,c])=>(
            <div key={l} style={{flex:1,background:c+"15",borderRadius:10,padding:"8px 10px",textAlign:"center",border:`1px solid ${c}33`}}>
              <div style={{fontSize:18,fontWeight:800,color:c}}>{v}</div>
              <div style={{fontSize:10,color:C.sub,fontWeight:600}}>{l}</div>
            </div>
          ))}
        </div>
        {filtrados.map(u=>(
          <div key={u.id} style={{background:C.bg,borderRadius:12,padding:12,marginBottom:10,border:`1.5px solid ${u.status==="ativo"?C.border:C.red+"33"}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:38,height:38,borderRadius:19,background:`linear-gradient(135deg,${C.accent},${C.purple})`,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:700,fontSize:15}}>{u.nome[0].toUpperCase()}</div>
                <div>
                  <div style={{fontSize:14,fontWeight:700}}>{u.nome}</div>
                  <div style={{fontSize:11,color:C.sub}}>{u.email}</div>
                  {u.mustChangePassword&&<div style={{fontSize:10,color:C.yellow,fontWeight:600}}>⚠️ Aguardando troca de senha</div>}
                </div>
              </div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                <span style={{background:u.perfil==="admin"?C.purple+"22":C.accent+"22",color:u.perfil==="admin"?C.purple:C.accent,borderRadius:6,padding:"2px 8px",fontSize:10,fontWeight:700}}>{u.perfil==="admin"?"🔑 Admin":"👤 Usuário"}</span>
                <span style={{background:u.status==="ativo"?C.green+"22":C.red+"22",color:u.status==="ativo"?C.green:C.red,borderRadius:6,padding:"2px 8px",fontSize:10,fontWeight:700}}>{u.status==="ativo"?"● Ativo":"● Inativo"}</span>
              </div>
            </div>
            <div style={{fontSize:10,color:C.sub,marginBottom:10}}>Criado: {u.createdAt} · Último acesso: {u.lastLoginAt}</div>
            <div style={{display:"flex",gap:6}}>
              <button onClick={()=>editar(u)} style={{flex:1,background:"none",border:`1px solid ${C.border}`,borderRadius:8,padding:"7px",cursor:"pointer",color:C.accent,fontSize:12,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>
                <Icon name="edit" size={13} color={C.accent}/>Editar
              </button>
              <button onClick={()=>toggleStatus(u.id)} style={{flex:1,background:"none",border:`1px solid ${C.border}`,borderRadius:8,padding:"7px",cursor:"pointer",color:u.status==="ativo"?C.red:C.green,fontSize:12,fontWeight:600}}>
                {u.status==="ativo"?"🚫 Desativar":"✅ Ativar"}
              </button>
              <button onClick={()=>{setResetando(u.id);setNovaSenhaReset("");}} style={{flex:1,background:"none",border:`1px solid ${C.border}`,borderRadius:8,padding:"7px",cursor:"pointer",color:C.yellow,fontSize:12,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>
                <Icon name="lock" size={13} color={C.yellow}/>Senha
              </button>
              {u.perfil!=="admin"&&<button onClick={()=>excluir(u.id)} style={{background:"none",border:`1px solid ${C.red}22`,borderRadius:8,padding:"7px 10px",cursor:"pointer",display:"flex",alignItems:"center"}}>
                <Icon name="trash" size={14} color={C.red}/>
              </button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
