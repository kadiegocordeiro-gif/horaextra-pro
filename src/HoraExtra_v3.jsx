import { useState, useCallback } from "react";

// ─── CONSTANTES ──────────────────────────────────────────────────────────────
const FERIADOS_NACIONAIS = ["01-01","04-21","05-01","09-07","10-12","11-02","11-15","11-20","12-25"];
const DIAS_SEMANA = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];
const DIAS_KEYS = ["dom","seg","ter","qua","qui","sex","sab"];

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

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const isFeriadoNacional = (date) => {
  const mm=String(date.getMonth()+1).padStart(2,"0");
  const dd=String(date.getDate()).padStart(2,"0");
  return FERIADOS_NACIONAIS.includes(`${mm}-${dd}`);
};
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
  if(isSpecial){ extra100=worked; }
  else { const over=worked-contractMin; if(over>0){extra50=over; if(over>120)alerteLimite=true;} }
  const delay=Math.max(0,contractMin-worked);
  const val50=(extra50/60)*valorHora*1.5;
  const val100=(extra100/60)*valorHora*2;
  return {worked,normal,extra50,extra100,delay,val50,val100,total:val50+val100,alerteLimite};
};

// ─── CALCULAR PERÍODO DE PAGAMENTO ───────────────────────────────────────────
const calcularPeriodoPagamento = (fechamentoExtras) => {
  const hoje = new Date();
  const diaFech = parseInt(fechamentoExtras)||15;
  const diaAtual = hoje.getDate();

  // Se ainda não fechou este mês: período é do dia (diaFech+1) do mês anterior até diaFech deste mês
  // Se já fechou: período é do dia (diaFech+1) deste mês até diaFech do próximo mês
  let inicioMes, inicioAno, fimMes, fimAno;

  if(diaAtual > diaFech) {
    // Próximo pagamento: diaFech+1 deste mês até diaFech do próximo mês
    inicioAno = hoje.getFullYear();
    inicioMes = hoje.getMonth();
    fimMes = hoje.getMonth()+1;
    fimAno = hoje.getFullYear();
    if(fimMes>11){fimMes=0;fimAno++;}
  } else {
    // Próximo pagamento: diaFech+1 do mês anterior até diaFech deste mês
    inicioMes = hoje.getMonth()-1;
    inicioAno = hoje.getFullYear();
    if(inicioMes<0){inicioMes=11;inicioAno--;}
    fimMes = hoje.getMonth();
    fimAno = hoje.getFullYear();
  }

  const inicio = `${inicioAno}-${String(inicioMes+1).padStart(2,"0")}-${String(diaFech+1).padStart(2,"0")}`;
  const fim = `${fimAno}-${String(fimMes+1).padStart(2,"0")}-${String(diaFech).padStart(2,"0")}`;
  return {inicio, fim};
};

const calcularProximoPagamento = (registrosComCalc, fechamentoExtras) => {
  const {inicio,fim} = calcularPeriodoPagamento(fechamentoExtras);
  const filtrados = registrosComCalc.filter(r=>r.data>=inicio && r.data<=fim);
  return filtrados.reduce((acc,r)=>{
    if(!r.calc) return acc;
    acc.extra50+=r.calc.extra50; acc.extra100+=r.calc.extra100;
    acc.val50+=r.calc.val50; acc.val100+=r.calc.val100;
    acc.registros.push(r);
    return acc;
  },{extra50:0,extra100:0,val50:0,val100:0,registros:[],inicio,fim});
};

const calcularHistoricoTotal = (registrosComCalc) => {
  return registrosComCalc.reduce((acc,r)=>{
    if(!r.calc) return acc;
    acc.extra50+=r.calc.extra50; acc.extra100+=r.calc.extra100;
    acc.val50+=r.calc.val50; acc.val100+=r.calc.val100; acc.worked+=r.calc.worked;
    return acc;
  },{extra50:0,extra100:0,val50:0,val100:0,worked:0});
};

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
  };
  return icons[name]||null;
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

// ─── APP PRINCIPAL ────────────────────────────────────────────────────────────
export default function App() {
  const [dark,setDark]=useStorage("hx_dark",false);
  const [tab,setTab]=useState("dashboard");
  const [config,setConfig]=useStorage("hx_config",{
    salario:"",gratificacoes:"",adicionais:"",
    fechamentoPonto:30,fechamentoExtras:15,
    escala:"5x2",jornadaSemanal:JORNADA_DEFAULT,
  });
  const [registros,setRegistros]=useStorage("hx_registros",[]);
  const [feriados,setFeriados]=useStorage("hx_feriados",[]);
  const [usuarios,setUsuarios]=useStorage("hx_usuarios",[
    {id:1,nome:"Administrador",email:"admin@horaextra.app",perfil:"admin",status:"ativo",criado:new Date().toISOString().split("T")[0],ultimoAcesso:new Date().toISOString().split("T")[0]}
  ]);

  const jornadaSemanal=config.jornadaSemanal||JORNADA_DEFAULT;
  const baseCalculo=(parseFloat(config.salario)||0)+(parseFloat(config.gratificacoes)||0);
  const totalMinSemana=DIAS_KEYS.reduce((acc,k)=>acc+jornadaDiaria(jornadaSemanal[k]),0);
  const totalMinMes=totalMinSemana*(52/12);
  const valorHora=totalMinMes>0?baseCalculo/(totalMinMes/60):0;

  const registrosComCalc=registros.map(r=>{
    const dt=new Date(r.data+"T12:00:00");
    const isSpecial=isDomingo(dt)||isFeriadoNacional(dt)||feriados.includes(r.data);
    const dKey=DIAS_KEYS[dt.getDay()];
    const contrato=jornadaDiaria(jornadaSemanal[dKey]);
    const calc=calcDay(r.entrada,r.saida,r.intervalo,contrato,valorHora,isSpecial);
    return {...r,calc,isSpecial,contrato};
  }).sort((a,b)=>a.data.localeCompare(b.data));

  const proximoPagamento=calcularProximoPagamento(registrosComCalc,config.fechamentoExtras);
  const historicoTotal=calcularHistoricoTotal(registrosComCalc);

  const C={
    bg:dark?"#0f172a":"#f1f5f9",card:dark?"#1e293b":"#ffffff",
    text:dark?"#f1f5f9":"#0f172a",sub:dark?"#94a3b8":"#64748b",
    border:dark?"#334155":"#e2e8f0",input:dark?"#334155":"#f8fafc",
    accent:"#6366f1",green:"#10b981",yellow:"#f59e0b",red:"#ef4444",purple:"#8b5cf6"
  };

  const S={
    wrap:{minHeight:"100vh",background:C.bg,fontFamily:"'Inter','Segoe UI',system-ui,sans-serif",color:C.text,maxWidth:430,margin:"0 auto",paddingBottom:84,transition:"background .3s,color .3s"},
    card:{background:C.card,borderRadius:16,padding:16,marginBottom:12,border:`1px solid ${C.border}`,boxShadow:dark?"0 4px 24px rgba(0,0,0,.35)":"0 2px 12px rgba(0,0,0,.07)"},
    inp:{background:C.input,border:`1.5px solid ${C.border}`,borderRadius:10,padding:"10px 14px",color:C.text,fontSize:15,width:"100%",outline:"none",boxSizing:"border-box",fontFamily:"inherit"},
    lbl:{fontSize:11,fontWeight:700,color:C.sub,marginBottom:5,display:"block",textTransform:"uppercase",letterSpacing:.7},
    btn:{background:"linear-gradient(135deg,#6366f1,#8b5cf6)",color:"#fff",border:"none",borderRadius:12,padding:"13px",fontSize:15,fontWeight:700,cursor:"pointer",width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:8,fontFamily:"inherit"},
    pill:(a)=>({background:a?C.accent:"transparent",color:a?"#fff":C.sub,border:`1.5px solid ${a?C.accent:C.border}`,borderRadius:20,padding:"6px 14px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",transition:"all .2s"}),
    nav:{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:430,background:C.card,borderTop:`1px solid ${C.border}`,display:"flex",zIndex:99,boxShadow:"0 -4px 20px rgba(0,0,0,.1)"},
    navBtn:(a)=>({flex:1,padding:"10px 4px 8px",display:"flex",flexDirection:"column",alignItems:"center",gap:3,cursor:"pointer",color:a?C.accent:C.sub,fontSize:10,fontWeight:a?700:500,background:"none",border:"none",fontFamily:"inherit",transition:"color .2s"}),
  };

  const props={S,C,dark,config,setConfig,registros,setRegistros,feriados,setFeriados,usuarios,setUsuarios,valorHora,registrosComCalc,proximoPagamento,historicoTotal,fmt,fmtDateStr,minToHHMM,calcDay,isDomingo,isFeriadoNacional,jornadaSemanal,jornadaDiaria,DIAS_KEYS,DIAS_SEMANA,TEMPLATES,JORNADA_DEFAULT};

  return (
    <div style={S.wrap}>
      {/* HEADER */}
      <div style={{background:"linear-gradient(135deg,#6366f1,#8b5cf6)",padding:"20px 20px 28px",borderRadius:"0 0 28px 28px",marginBottom:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <div style={{fontSize:10,color:"rgba(255,255,255,.65)",fontWeight:700,letterSpacing:2,textTransform:"uppercase"}}>HoraExtra Pro • CLT</div>
            <div style={{fontSize:24,fontWeight:800,color:"#fff",marginTop:3,letterSpacing:"-.5px"}}>Minha Jornada</div>
          </div>
          <button onClick={()=>setDark(!dark)} style={{background:"rgba(255,255,255,.15)",border:"none",borderRadius:10,padding:9,cursor:"pointer"}}>
            <Icon name={dark?"sun":"moon"} size={18} color="#fff"/>
          </button>
        </div>
        {/* Header cards — próximo pagamento */}
        <div style={{display:"flex",gap:10,marginTop:18}}>
          <div style={{flex:1,background:"rgba(255,255,255,.13)",borderRadius:14,padding:"12px 14px"}}>
            <div style={{fontSize:9,color:"rgba(255,255,255,.7)",fontWeight:700,textTransform:"uppercase",letterSpacing:.5}}>Horas no próximo pgto.</div>
            <div style={{fontSize:20,fontWeight:800,color:"#fff",marginTop:2}}>{minToHHMM(proximoPagamento.extra50+proximoPagamento.extra100)}</div>
            <div style={{fontSize:9,color:"rgba(255,255,255,.55)",marginTop:2}}>{fmtDateStr(proximoPagamento.inicio)} – {fmtDateStr(proximoPagamento.fim)}</div>
          </div>
          <div style={{flex:1,background:"rgba(255,255,255,.13)",borderRadius:14,padding:"12px 14px"}}>
            <div style={{fontSize:9,color:"rgba(255,255,255,.7)",fontWeight:700,textTransform:"uppercase",letterSpacing:.5}}>Valor previsto no contracheque</div>
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
        {tab==="usuarios"&&<Usuarios {...props}/>}
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

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard({S,C,proximoPagamento,historicoTotal,registrosComCalc,config,fmt,fmtDateStr,minToHHMM,BarChart}) {
  const [historicoAberto,setHistoricoAberto]=useState(false);
  const sal=parseFloat(config.salario)||0;
  const totalExt=proximoPagamento.val50+proximoPagamento.val100;
  const dsr=totalExt*.1667;
  const projecao=sal+totalExt+dsr;

  // Gráfico — barras do período do próximo pagamento (destacadas) vs demais
  const last8=[...registrosComCalc].slice(-8);
  const labels=["D","S","T","Q","Q","S","S","D"];
  const chartData=Array.from({length:8},(_,i)=>{
    const r=last8[i];
    const inPeriod=r&&r.data>=proximoPagamento.inicio&&r.data<=proximoPagamento.fim;
    const lbl=r?["D","S","T","Q","Q","S","S"][new Date(r.data+"T12:00:00").getDay()]:labels[i];
    return {label:lbl,value:r?.calc?(r.calc.extra50+r.calc.extra100)/60:0,highlight:inPeriod};
  });

  return (
    <div>
      {/* PERÍODO */}
      <div style={{...S.card,background:`linear-gradient(135deg,${C.green}15,${C.green}05)`,border:`1.5px solid ${C.green}33`}}>
        <div style={{fontSize:10,color:C.green,fontWeight:700,letterSpacing:.5,marginBottom:10}}>📅 PREVISÃO DE HORAS EXTRAS — PRÓXIMO PAGAMENTO</div>
        <div style={{fontSize:11,color:C.sub,marginBottom:12,background:C.green+"10",borderRadius:8,padding:"6px 10px"}}>
          Período considerado: <b>{fmtDateStr(proximoPagamento.inicio)}</b> a <b>{fmtDateStr(proximoPagamento.fim)}</b>
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

      {/* PROJEÇÃO SALÁRIO COMPLETO */}
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

      {/* GRÁFICO */}
      <div style={S.card}>
        <div style={{fontSize:13,fontWeight:700,marginBottom:2}}>📊 Horas extras por dia</div>
        <div style={{fontSize:10,color:C.sub,marginBottom:8}}>Verde = período do próximo pagamento</div>
        <BarChart data={chartData} textColor={C.sub}/>
      </div>

      {/* REFLEXOS */}
      <div style={S.card}>
        <div style={{fontSize:13,fontWeight:700,marginBottom:10}}>🔢 Reflexos Estimados (sobre período)</div>
        {[["DSR s/ extras do período",dsr,C.yellow],["Férias + 1/3 (proj. anual)",(sal+totalExt)/12*(4/3),C.green],["13º Salário (proj. anual)",(sal+totalExt)/12,C.accent],["FGTS 8%",projecao*.08,C.purple]].map(([l,v,cor])=>(
          <div key={l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${C.border}`}}>
            <span style={{fontSize:13,color:C.sub}}>{l}</span>
            <span style={{fontSize:14,fontWeight:700,color:cor}}>{fmt(v)}</span>
          </div>
        ))}
      </div>

      {/* HISTÓRICO TOTAL — recolhido */}
      <div style={{...S.card,cursor:"pointer"}} onClick={()=>setHistoricoAberto(!historicoAberto)}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:13,fontWeight:700}}>📁 Histórico Total</div>
            <div style={{fontSize:11,color:C.sub,marginTop:2}}>Todos os registros desde o início</div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:14,fontWeight:700,color:C.sub}}>{fmt(historicoTotal.val50+historicoTotal.val100)}</span>
            <div style={{transform:historicoAberto?"rotate(180deg)":"none",transition:"transform .3s"}}>
              <Icon name="chevron" size={18} color={C.sub}/>
            </div>
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

// ─── PONTO ────────────────────────────────────────────────────────────────────
function Ponto({S,C,registros,setRegistros,feriados,config,valorHora,fmt,fmtDateStr,minToHHMM,calcDay,isDomingo,isFeriadoNacional,jornadaSemanal,jornadaDiaria,DIAS_KEYS,DIAS_SEMANA,proximoPagamento}) {
  const today=new Date().toISOString().split("T")[0];
  const FORM_VAZIO={data:today,entrada:"",saida:"",intervalo:"60",obs:""};
  const [form,setForm]=useState(FORM_VAZIO);
  const [preview,setPreview]=useState(null);
  const [editando,setEditando]=useState(null); // data do registro sendo editado
  const upd=(k,v)=>{
    const nf={...form,[k]:v};
    setForm(nf);
    const dt=new Date(nf.data+"T12:00:00");
    const isSp=isDomingo(dt)||isFeriadoNacional(dt)||feriados.includes(nf.data);
    const contrato=jornadaDiaria(jornadaSemanal[DIAS_KEYS[dt.getDay()]]);
    const c=calcDay(nf.entrada,nf.saida,nf.intervalo,contrato,valorHora,isSp);
    setPreview(c?{...c,isSpecial:isSp,contrato}:null);
  };

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

  const cancelarEdicao=()=>{setForm(FORM_VAZIO);setEditando(null);setPreview(null);};

  const save=()=>{
    if(!form.entrada||!form.saida){alert("Preencha entrada e saída!");return;}
    if(editando){
      setRegistros(registros.map(r=>r.data===editando?{...form}:r));
      setEditando(null);
    } else {
      const idx=registros.findIndex(r=>r.data===form.data);
      if(idx>=0){const u=[...registros];u[idx]={...form};setRegistros(u);}
      else setRegistros([...registros,{...form}]);
    }
    setForm(FORM_VAZIO);setPreview(null);
  };

  const remove=(data)=>setRegistros(registros.filter(r=>r.data!==data));

  const contratoLabel=()=>{
    const dt=new Date(form.data+"T12:00:00");
    return `${DIAS_SEMANA[dt.getDay()]} · Contrato: ${minToHHMM(jornadaDiaria(jornadaSemanal[DIAS_KEYS[dt.getDay()]]))}`;
  };

  return (
    <div>
      <div style={{...S.card,border:editando?`2px solid ${C.yellow}`:undefined}}>
        <div style={{fontSize:13,fontWeight:700,color:editando?C.yellow:C.accent,marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span>{editando?"✏️ EDITANDO REGISTRO":"⏱️ NOVO REGISTRO DE PONTO"}</span>
          {editando&&<button onClick={cancelarEdicao} style={{background:C.border,border:"none",borderRadius:8,padding:"4px 10px",cursor:"pointer",fontSize:12,color:C.sub}}>Cancelar</button>}
        </div>
        <div style={{marginBottom:12}}>
          <label style={S.lbl}>Data</label>
          <input type="date" value={form.data} onChange={e=>upd("data",e.target.value)} style={S.inp} disabled={!!editando}/>
          <div style={{fontSize:11,color:C.sub,marginTop:4}}>{contratoLabel()}</div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
          <div><label style={S.lbl}>Entrada</label><input type="time" value={form.entrada} onChange={e=>upd("entrada",e.target.value)} style={S.inp}/></div>
          <div><label style={S.lbl}>Saída</label><input type="time" value={form.saida} onChange={e=>upd("saida",e.target.value)} style={S.inp}/></div>
        </div>
        <div style={{marginBottom:12}}>
          <label style={S.lbl}>Intervalo (minutos)</label>
          <input type="number" value={form.intervalo} onChange={e=>upd("intervalo",e.target.value)} style={S.inp}/>
        </div>
        <div style={{marginBottom:14}}>
          <label style={S.lbl}>Observação</label>
          <input type="text" value={form.obs} onChange={e=>upd("obs",e.target.value)} placeholder="Ex: extra autorizada pelo gestor" style={S.inp}/>
        </div>

        {preview&&(
          <div style={{background:C.bg,borderRadius:12,padding:14,marginBottom:14,border:`1px solid ${C.border}`}}>
            <div style={{fontSize:10,fontWeight:700,color:C.sub,letterSpacing:.5,marginBottom:10}}>PRÉ-VISUALIZAÇÃO</div>
            {preview.isSpecial&&<div style={{background:C.red+"15",color:C.red,borderRadius:8,padding:"7px 10px",fontSize:12,fontWeight:600,marginBottom:10}}>⚠️ Domingo/Feriado — adicional 100% automático</div>}
            {preview.alerteLimite&&<div style={{background:C.yellow+"15",color:C.yellow,borderRadius:8,padding:"7px 10px",fontSize:12,fontWeight:600,marginBottom:10}}>⚠️ Jornada excedeu 2h extras. Verifique com seu gestor.</div>}
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

      {/* HISTÓRICO */}
      <div style={S.card}>
        <div style={{fontSize:13,fontWeight:700,marginBottom:12}}>📋 Histórico ({registros.length} registros)</div>
        {registros.length===0&&<div style={{textAlign:"center",padding:16,color:C.sub,fontSize:13}}>Sem registros.</div>}
        {[...registros].sort((a,b)=>b.data.localeCompare(a.data)).map((r,i)=>{
          const dt=new Date(r.data+"T12:00:00");
          const isSp=isDomingo(dt)||isFeriadoNacional(dt)||feriados.includes(r.data);
          const contrato=jornadaDiaria(jornadaSemanal[DIAS_KEYS[dt.getDay()]]);
          const c=calcDay(r.entrada,r.saida,r.intervalo,contrato,valorHora,isSp);
          const noPeriodo=r.data>=proximoPagamento.inicio&&r.data<=proximoPagamento.fim;
          return (
            <div key={i} style={{padding:"10px 0",borderBottom:`1px solid ${C.border}`,opacity:editando===r.data?0.5:1}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                    <span style={{fontSize:13,fontWeight:600}}>{fmtDateStr(dt)}</span>
                    {noPeriodo&&<span style={{background:C.green+"22",color:C.green,borderRadius:5,padding:"1px 6px",fontSize:10,fontWeight:700}}>Próx. pgto.</span>}
                    {isSp&&<span style={{background:C.red+"22",color:C.red,borderRadius:5,padding:"1px 6px",fontSize:10,fontWeight:700}}>FERIADO</span>}
                    {c?.alerteLimite&&<span style={{background:C.yellow+"22",color:C.yellow,borderRadius:5,padding:"1px 6px",fontSize:10,fontWeight:700}}>+2h</span>}
                  </div>
                  <div style={{fontSize:11,color:C.sub,marginTop:1}}>{r.entrada} → {r.saida} · contrato {minToHHMM(contrato)}</div>
                  {r.obs&&<div style={{fontSize:11,color:C.sub,fontStyle:"italic"}}>"{r.obs}"</div>}
                </div>
                <div style={{textAlign:"right"}}>
                  {c&&<div style={{fontSize:14,fontWeight:700,color:C.green}}>{fmt(c.total)}</div>}
                  {c&&<div style={{fontSize:10,color:C.sub}}>{minToHHMM(c.extra50+c.extra100)} ext.</div>}
                </div>
              </div>
              {/* AÇÕES EDITAR / EXCLUIR */}
              <div style={{display:"flex",gap:8,marginTop:8}}>
                <button onClick={()=>iniciarEdicao(r)} style={{flex:1,background:"none",border:`1px solid ${C.border}`,borderRadius:8,padding:"6px",cursor:"pointer",color:C.accent,fontSize:12,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>
                  <Icon name="edit" size={13} color={C.accent}/> Editar
                </button>
                <button onClick={()=>remove(r.data)} style={{flex:1,background:"none",border:`1px solid ${C.red}33`,borderRadius:8,padding:"6px",cursor:"pointer",color:C.red,fontSize:12,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>
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

// ─── RELATÓRIO ────────────────────────────────────────────────────────────────
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
    t+=`===== HISTÓRICO TOTAL =====\n`;
    t+=`Extras 50%: ${minToHHMM(historicoTotal.extra50)} = ${fmt(historicoTotal.val50)}\n`;
    t+=`Extras 100%: ${minToHHMM(historicoTotal.extra100)} = ${fmt(historicoTotal.val100)}\n`;
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
      {/* PRÓXIMO PAGAMENTO */}
      <div style={{...S.card,background:`linear-gradient(135deg,${C.green}15,${C.green}05)`,border:`1.5px solid ${C.green}33`}}>
        <div style={{fontSize:10,color:C.green,fontWeight:700,letterSpacing:.5,marginBottom:6}}>💰 PRÓXIMO PAGAMENTO</div>
        <div style={{fontSize:11,color:C.sub,marginBottom:10,background:C.green+"10",borderRadius:8,padding:"5px 10px"}}>
          Período: <b>{fmtDateStr(proximoPagamento.inicio)}</b> a <b>{fmtDateStr(proximoPagamento.fim)}</b>
        </div>
        {[["📈 Horas extras 50%",minToHHMM(proximoPagamento.extra50),fmt(proximoPagamento.val50),C.yellow],["🔥 Horas extras 100%",minToHHMM(proximoPagamento.extra100),fmt(proximoPagamento.val100),C.red],["📅 DSR estimado","—",fmt(dsr),C.accent],["💰 VALOR PREVISTO NO CONTRACHEQUE",minToHHMM(proximoPagamento.extra50+proximoPagamento.extra100),fmt(totalExt+dsr),C.green]].map(([l,h,v,c],bold)=>(
          <div key={l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${C.border}`}}>
            <div>
              <div style={{fontSize:bold===3?14:13,fontWeight:bold===3?700:500,color:bold===3?c:C.text}}>{l}</div>
              <div style={{fontSize:11,color:C.sub}}>{h}</div>
            </div>
            <span style={{fontSize:bold===3?20:15,fontWeight:700,color:c}}>{v}</span>
          </div>
        ))}
      </div>

      {/* HISTÓRICO POR MÊS */}
      <div style={{...S.card,marginBottom:6}}>
        <div style={{fontSize:13,fontWeight:700,color:C.sub,marginBottom:2}}>📁 Histórico Total</div>
        <div style={{fontSize:11,color:C.sub}}>{fmt(historicoTotal.val50+historicoTotal.val100)} acumulados</div>
      </div>

      {months.length===0&&<div style={{...S.card,textAlign:"center",padding:32,color:C.sub}}><div style={{fontSize:36,marginBottom:8}}>📊</div>Sem dados.</div>}
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

// ─── CONFIG ───────────────────────────────────────────────────────────────────
function Config({S,C,config,setConfig,feriados,setFeriados,jornadaSemanal,jornadaDiaria,DIAS_KEYS,DIAS_SEMANA,TEMPLATES,JORNADA_DEFAULT,minToHHMM}) {
  const [novoF,setNovoF]=useState("");
  const upd=(k,v)=>setConfig({...config,[k]:v});
  const updJornada=(dKey,field,value)=>setConfig({...config,jornadaSemanal:{...jornadaSemanal,[dKey]:{...jornadaSemanal[dKey],[field]:value}}});

  const totalSemanMin=DIAS_KEYS.reduce((acc,k)=>acc+jornadaDiaria(jornadaSemanal[k]),0);
  const diasAtivos=DIAS_KEYS.filter(k=>jornadaSemanal[k]?.ativo).length;
  const mediaDiaria=diasAtivos>0?totalSemanMin/diasAtivos:0;
  const sal=(parseFloat(config.salario)||0)+(parseFloat(config.gratificacoes)||0);
  const vh=totalSemanMin>0?sal/((totalSemanMin*(52/12))/60):0;

  const copiarParaTodos=(dKey)=>{
    const fonte=jornadaSemanal[dKey];
    const nova={...jornadaSemanal};
    DIAS_KEYS.forEach(k=>{if(k!==dKey)nova[k]={...nova[k],entrada:fonte.entrada,saida:fonte.saida,intervalo:fonte.intervalo};});
    setConfig({...config,jornadaSemanal:nova});
  };

  return (
    <div>
      {/* SALÁRIO */}
      <div style={S.card}>
        <div style={{fontSize:13,fontWeight:700,color:C.accent,marginBottom:14}}>💼 CADASTRO SALARIAL</div>
        {[["Salário Base (R$)","salario"],["Gratificações Habituais (R$)","gratificacoes"],["Adicionais Fixos (R$)","adicionais"]].map(([l,k])=>(
          <div key={k} style={{marginBottom:12}}>
            <label style={S.lbl}>{l}</label>
            <input type="number" value={config[k]} onChange={e=>upd(k,e.target.value)} placeholder="0,00" style={S.inp}/>
          </div>
        ))}
        <div style={{background:C.green+"12",borderRadius:12,padding:14,border:`1.5px solid ${C.green}33`}}>
          <div style={{fontSize:10,color:C.sub,fontWeight:700,letterSpacing:.5}}>VALOR DA HORA CALCULADO</div>
          <div style={{fontSize:26,fontWeight:800,color:C.green,marginTop:4}}>{vh>0?`R$ ${vh.toFixed(2)}/h`:"Configure →"}</div>
          {vh>0&&<>
            <div style={{fontSize:12,color:C.yellow,marginTop:4,fontWeight:600}}>📈 50%: R$ {(vh*1.5).toFixed(2)}/h · 🔥 100%: R$ {(vh*2).toFixed(2)}/h</div>
            <div style={{fontSize:11,color:C.sub,marginTop:2}}>Base: {minToHHMM(totalSemanMin)}/sem · {minToHHMM(Math.round(totalSemanMin*(52/12)/12))}/mês</div>
          </>}
        </div>
      </div>

      {/* JORNADA POR DIA */}
      <div style={S.card}>
        <div style={{fontSize:13,fontWeight:700,color:C.accent,marginBottom:10}}>⏱️ JORNADA POR DIA DA SEMANA</div>
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,color:C.sub,fontWeight:700,marginBottom:8}}>TEMPLATES PRONTOS</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
            {Object.keys(TEMPLATES).map(t=>(
              <button key={t} onClick={()=>setConfig({...config,jornadaSemanal:TEMPLATES[t]})} style={{...S.pill(false),fontSize:11}}>{t}</button>
            ))}
          </div>
        </div>
        <div style={{background:C.accent+"12",borderRadius:10,padding:"10px 14px",marginBottom:14,border:`1px solid ${C.accent}33`}}>
          <div style={{display:"flex",justifyContent:"space-between"}}>
            <div><div style={{fontSize:10,color:C.sub,fontWeight:600}}>TOTAL SEMANAL</div><div style={{fontSize:18,fontWeight:800,color:C.accent}}>{minToHHMM(totalSemanMin)}</div></div>
            <div><div style={{fontSize:10,color:C.sub,fontWeight:600}}>DIAS ATIVOS</div><div style={{fontSize:18,fontWeight:800,color:C.accent}}>{diasAtivos}</div></div>
            <div><div style={{fontSize:10,color:C.sub,fontWeight:600}}>MÉDIA DIÁRIA</div><div style={{fontSize:18,fontWeight:800,color:C.accent}}>{minToHHMM(Math.round(mediaDiaria))}</div></div>
          </div>
        </div>
        {DIAS_KEYS.map((dKey,i)=>{
          const dia=jornadaSemanal[dKey]||{ativo:false,entrada:"08:00",saida:"17:00",intervalo:60};
          const liq=jornadaDiaria(dia);
          return (
            <div key={dKey} style={{background:C.bg,borderRadius:12,padding:12,marginBottom:10,border:`1.5px solid ${dia.ativo?C.accent+"44":C.border}`,opacity:dia.ativo?1:0.6}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:dia.ativo?10:0}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <button onClick={()=>updJornada(dKey,"ativo",!dia.ativo)} style={{width:40,height:22,borderRadius:11,background:dia.ativo?C.accent:C.border,border:"none",cursor:"pointer",position:"relative",transition:"background .2s"}}>
                    <div style={{width:18,height:18,borderRadius:9,background:"#fff",position:"absolute",top:2,left:dia.ativo?20:2,transition:"left .2s"}}/>
                  </button>
                  <span style={{fontSize:14,fontWeight:700}}>{DIAS_SEMANA[i]}</span>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  {dia.ativo?<span style={{fontSize:12,fontWeight:700,color:C.green}}>{minToHHMM(liq)}</span>:<span style={{fontSize:12,color:C.sub}}>Folga</span>}
                  {dia.ativo&&<button onClick={()=>copiarParaTodos(dKey)} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:7,padding:"3px 7px",cursor:"pointer",color:C.sub,fontSize:10,display:"flex",alignItems:"center",gap:4}}>
                    <Icon name="copy" size={12} color={C.sub}/> copiar
                  </button>}
                </div>
              </div>
              {dia.ativo&&(
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 80px",gap:8}}>
                  <div><div style={{fontSize:9,color:C.sub,fontWeight:700,marginBottom:4}}>ENTRADA</div><input type="time" value={dia.entrada} onChange={e=>updJornada(dKey,"entrada",e.target.value)} style={{...S.inp,padding:"7px 10px",fontSize:13}}/></div>
                  <div><div style={{fontSize:9,color:C.sub,fontWeight:700,marginBottom:4}}>SAÍDA</div><input type="time" value={dia.saida} onChange={e=>updJornada(dKey,"saida",e.target.value)} style={{...S.inp,padding:"7px 10px",fontSize:13}}/></div>
                  <div><div style={{fontSize:9,color:C.sub,fontWeight:700,marginBottom:4}}>INTERVALO</div><input type="number" value={dia.intervalo} onChange={e=>updJornada(dKey,"intervalo",parseInt(e.target.value)||0)} style={{...S.inp,padding:"7px 10px",fontSize:13}}/></div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* FECHAMENTO */}
      <div style={S.card}>
        <div style={{fontSize:13,fontWeight:700,color:C.accent,marginBottom:14}}>📅 FECHAMENTO DO PONTO</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
          <div><label style={S.lbl}>Ponto fecha dia</label><input type="number" min="1" max="31" value={config.fechamentoPonto} onChange={e=>upd("fechamentoPonto",parseInt(e.target.value)||30)} style={S.inp}/></div>
          <div><label style={S.lbl}>Extras fecham dia</label><input type="number" min="1" max="31" value={config.fechamentoExtras} onChange={e=>upd("fechamentoExtras",parseInt(e.target.value)||15)} style={S.inp}/></div>
        </div>
        <div style={{background:C.bg,borderRadius:10,padding:10,fontSize:12,color:C.sub,border:`1px solid ${C.border}`}}>
          ℹ️ Ponto fecha dia <b>{config.fechamentoPonto}</b> · Extras fecham dia <b>{config.fechamentoExtras}</b><br/>
          <span style={{fontSize:11}}>Período do próximo pgto.: dia {config.fechamentoExtras+1} do mês anterior até dia {config.fechamentoExtras} deste mês.</span>
        </div>
      </div>

      {/* FERIADOS */}
      <div style={S.card}>
        <div style={{fontSize:13,fontWeight:700,color:C.accent,marginBottom:6}}>🗓️ FERIADOS LOCAIS</div>
        <div style={{fontSize:11,color:C.sub,marginBottom:12}}>Feriados nacionais já cadastrados. Adicione municipais/estaduais:</div>
        <div style={{display:"flex",gap:8,marginBottom:12}}>
          <input type="date" value={novoF} onChange={e=>setNovoF(e.target.value)} style={{...S.inp,flex:1}}/>
          <button onClick={()=>{if(novoF&&!feriados.includes(novoF)){setFeriados([...feriados,novoF]);setNovoF("");}}} style={{background:C.accent,border:"none",borderRadius:10,padding:"0 14px",cursor:"pointer",display:"flex",alignItems:"center",height:44}}>
            <Icon name="plus" size={18} color="#fff"/>
          </button>
        </div>
        {[...feriados].sort().map(d=>(
          <div key={d} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${C.border}`}}>
            <span style={{fontSize:13}}>{new Date(d+"T12:00:00").toLocaleDateString("pt-BR",{weekday:"short",day:"2-digit",month:"long"})}</span>
            <button onClick={()=>setFeriados(feriados.filter(f=>f!==d))} style={{background:"none",border:"none",cursor:"pointer",padding:4}}>
              <Icon name="trash" size={15} color={C.red}/>
            </button>
          </div>
        ))}
      </div>

      <div style={{...S.card,textAlign:"center",background:C.accent+"10",border:`1.5px solid ${C.accent}33`}}>
        <div style={{fontSize:12,color:C.sub,lineHeight:1.7}}>
          ⚖️ CLT Art. 59 · Extras dias úteis = 50% · Dom/Feriados = 100%<br/>
          <b>Acima de 2h extras: apenas alerta informativo.</b>
        </div>
      </div>
    </div>
  );
}

// ─── USUÁRIOS ─────────────────────────────────────────────────────────────────
function Usuarios({S,C,usuarios,setUsuarios}) {
  const [view,setView]=useState("lista");
  const [editId,setEditId]=useState(null);
  const [form,setForm]=useState({nome:"",email:"",senha:"",perfil:"usuario",status:"ativo"});
  const [filtro,setFiltro]=useState("");
  const upd=(k,v)=>setForm(f=>({...f,[k]:v}));

  const save=()=>{
    if(!form.nome||!form.email){alert("Nome e e-mail obrigatórios!");return;}
    if(editId){setUsuarios(usuarios.map(u=>u.id===editId?{...u,...form}:u));}
    else setUsuarios([...usuarios,{...form,id:Date.now(),criado:new Date().toISOString().split("T")[0],ultimoAcesso:"—"}]);
    setForm({nome:"",email:"",senha:"",perfil:"usuario",status:"ativo"});setEditId(null);setView("lista");
  };

  const editar=(u)=>{setForm({nome:u.nome,email:u.email,senha:"",perfil:u.perfil,status:u.status});setEditId(u.id);setView("form");};
  const excluir=(id)=>setUsuarios(usuarios.filter(u=>u.id!==id));
  const toggleStatus=(id)=>setUsuarios(usuarios.map(u=>u.id===id?{...u,status:u.status==="ativo"?"inativo":"ativo"}:u));

  const filtrados=usuarios.filter(u=>u.nome.toLowerCase().includes(filtro.toLowerCase())||u.email.toLowerCase().includes(filtro.toLowerCase()));

  if(view==="form") return (
    <div>
      <div style={S.card}>
        <div style={{fontSize:13,fontWeight:700,color:C.accent,marginBottom:14}}>{editId?"✏️ EDITAR USUÁRIO":"👤 NOVO USUÁRIO"}</div>
        {[["Nome completo","nome","text"],["E-mail","email","email"],["Senha","senha","password"]].map(([l,k,t])=>(
          <div key={k} style={{marginBottom:12}}>
            <label style={S.lbl}>{l}</label>
            <input type={t} value={form[k]} onChange={e=>upd(k,e.target.value)} style={S.inp}/>
          </div>
        ))}
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
        <div style={{display:"flex",gap:10}}>
          <button onClick={()=>{setView("lista");setEditId(null);}} style={{...S.btn,background:C.border,color:C.text,flex:1}}>Cancelar</button>
          <button onClick={save} style={{...S.btn,flex:2}}><Icon name="check" size={18} color="#fff"/> Salvar</button>
        </div>
      </div>
    </div>
  );

  return (
    <div>
      <div style={S.card}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div style={{fontSize:13,fontWeight:700,color:C.accent}}>👥 USUÁRIOS ({usuarios.length})</div>
          <button onClick={()=>{setForm({nome:"",email:"",senha:"",perfil:"usuario",status:"ativo"});setEditId(null);setView("form");}} style={{background:C.accent,border:"none",borderRadius:10,padding:"8px 14px",cursor:"pointer",color:"#fff",fontSize:13,fontWeight:700,display:"flex",alignItems:"center",gap:6}}>
            <Icon name="plus" size={15} color="#fff"/> Novo
          </button>
        </div>
        <input type="text" value={filtro} onChange={e=>setFiltro(e.target.value)} placeholder="Buscar..." style={{...S.inp,marginBottom:14}}/>
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
                <div style={{width:36,height:36,borderRadius:18,background:`linear-gradient(135deg,${C.accent},${C.purple})`,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:700,fontSize:14}}>{u.nome[0].toUpperCase()}</div>
                <div>
                  <div style={{fontSize:14,fontWeight:700}}>{u.nome}</div>
                  <div style={{fontSize:11,color:C.sub}}>{u.email}</div>
                </div>
              </div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                <span style={{background:u.perfil==="admin"?C.purple+"22":C.accent+"22",color:u.perfil==="admin"?C.purple:C.accent,borderRadius:6,padding:"2px 8px",fontSize:10,fontWeight:700}}>{u.perfil==="admin"?"🔑 Admin":"👤 Usuário"}</span>
                <span style={{background:u.status==="ativo"?C.green+"22":C.red+"22",color:u.status==="ativo"?C.green:C.red,borderRadius:6,padding:"2px 8px",fontSize:10,fontWeight:700}}>{u.status==="ativo"?"● Ativo":"● Inativo"}</span>
              </div>
            </div>
            <div style={{display:"flex",gap:6}}>
              <button onClick={()=>editar(u)} style={{flex:1,background:"none",border:`1px solid ${C.border}`,borderRadius:8,padding:"7px",cursor:"pointer",color:C.accent,fontSize:12,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>
                <Icon name="edit" size={13} color={C.accent}/> Editar
              </button>
              <button onClick={()=>toggleStatus(u.id)} style={{flex:1,background:"none",border:`1px solid ${C.border}`,borderRadius:8,padding:"7px",cursor:"pointer",color:u.status==="ativo"?C.red:C.green,fontSize:12,fontWeight:600}}>
                {u.status==="ativo"?"🚫 Desativar":"✅ Ativar"}
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
