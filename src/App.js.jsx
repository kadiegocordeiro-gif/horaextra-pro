import { useState, useEffect, useCallback } from "react";

const FERIADOS_NACIONAIS = ["01-01","04-21","05-01","09-07","10-12","11-02","11-15","11-20","12-25"];
const isFeriadoNacional = (date) => {
  const mm = String(date.getMonth()+1).padStart(2,"0");
  const dd = String(date.getDate()).padStart(2,"0");
  return FERIADOS_NACIONAIS.includes(`${mm}-${dd}`);
};
const isDomingo = (date) => date.getDay() === 0;
const parseTime = (str) => { if (!str) return null; const [h,m]=str.split(":").map(Number); return h*60+m; };
const minToHHMM = (min) => { const sign=min<0?"-":""; const abs=Math.abs(min); return `${sign}${String(Math.floor(abs/60)).padStart(2,"0")}:${String(abs%60).padStart(2,"0")}`; };
const fmt = (n) => n.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const fmtDate = (d) => d.toLocaleDateString("pt-BR");

const calcDay = (entry,exit,interval,contractMin,valorHora,isSpecial) => {
  if (!entry||!exit) return null;
  const e=parseTime(entry),s=parseTime(exit),i=parseInt(interval)||0;
  let worked=s-e-i; if(worked<0) worked+=24*60;
  const normal=Math.min(worked,contractMin);
  let extra50=0,extra100=0;
  if(isSpecial){ extra100=worked; }
  else { const over=worked-contractMin; if(over>0){extra50=Math.min(over,120);extra100=Math.max(0,over-120);} }
  const delay=Math.max(0,contractMin-worked);
  const val50=(extra50/60)*valorHora*1.5, val100=(extra100/60)*valorHora*2;
  return {worked,normal,extra50,extra100,delay,val50,val100,total:val50+val100};
};

const useStorage = (key,def) => {
  const [v,setV]=useState(()=>{ try{const s=localStorage.getItem(key);return s?JSON.parse(s):def;}catch{return def;} });
  const save=useCallback((val)=>{setV(val);try{localStorage.setItem(key,JSON.stringify(val));}catch{}},[key]);
  return [v,save];
};

const Icon = ({name,size=20,color="currentColor"}) => {
  const p={stroke:color,strokeWidth:"2",fill:"none"};
  const icons={
    home:<svg width={size} height={size} viewBox="0 0 24 24" {...p}><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
    plus:<svg width={size} height={size} viewBox="0 0 24 24" {...p}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
    chart:<svg width={size} height={size} viewBox="0 0 24 24" {...p}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
    settings:<svg width={size} height={size} viewBox="0 0 24 24" {...p}><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93l-1.41 1.41M4.93 4.93l1.41 1.41M12 2v2M12 20v2M20 12h2M2 12h2M19.07 19.07l-1.41-1.41M4.93 19.07l1.41-1.41"/></svg>,
    check:<svg width={size} height={size} viewBox="0 0 24 24" {...p}><polyline points="20 6 9 17 4 12"/></svg>,
    trash:<svg width={size} height={size} viewBox="0 0 24 24" {...p}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>,
    sun:<svg width={size} height={size} viewBox="0 0 24 24" {...p}><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>,
    moon:<svg width={size} height={size} viewBox="0 0 24 24" {...p}><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>,
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
            <div style={{width:"100%",background:"linear-gradient(180deg,#818cf8,#6366f1)",borderRadius:4,height:`${(d.value/max)*100}%`,minHeight:d.value>0?4:0,transition:"height .5s ease"}}/>
          </div>
          <span style={{fontSize:9,color:textColor,fontWeight:600}}>{d.label}</span>
        </div>
      ))}
    </div>
  );
};

export default function App() {
  const [dark,setDark]=useStorage("hx_dark",false);
  const [tab,setTab]=useState("dashboard");
  const [config,setConfig]=useStorage("hx_config",{salario:"",gratificacoes:"",adicionais:"",jornadaMensal:220,jornadaDiaria:480,escala:"5x2",fechamentoPonto:20,fechamentoExtras:15});
  const [registros,setRegistros]=useStorage("hx_registros",[]);
  const [feriados,setFeriados]=useStorage("hx_feriados",[]);

  const baseCalculo=(parseFloat(config.salario)||0)+(parseFloat(config.gratificacoes)||0);
  const valorHora=config.jornadaMensal>0?baseCalculo/config.jornadaMensal:0;

  const registrosComCalc=registros.map(r=>{
    const dt=new Date(r.data+"T12:00:00");
    const isSpecial=isDomingo(dt)||isFeriadoNacional(dt)||feriados.includes(r.data);
    const calc=calcDay(r.entrada,r.saida,r.intervalo,config.jornadaDiaria,valorHora,isSpecial);
    return {...r,calc,isSpecial};
  }).sort((a,b)=>a.data.localeCompare(b.data));

  const totals=registrosComCalc.reduce((acc,r)=>{
    if(!r.calc) return acc;
    acc.extra50+=r.calc.extra50; acc.extra100+=r.calc.extra100;
    acc.val50+=r.calc.val50; acc.val100+=r.calc.val100; acc.worked+=r.calc.worked;
    return acc;
  },{extra50:0,extra100:0,val50:0,val100:0,worked:0});

  const C={
    bg:dark?"#0f172a":"#f1f5f9",
    card:dark?"#1e293b":"#ffffff",
    text:dark?"#f1f5f9":"#0f172a",
    sub:dark?"#94a3b8":"#64748b",
    border:dark?"#334155":"#e2e8f0",
    input:dark?"#334155":"#f8fafc",
    accent:"#6366f1", green:"#10b981", yellow:"#f59e0b", red:"#ef4444", purple:"#8b5cf6"
  };

  const S={
    wrap:{minHeight:"100vh",background:C.bg,fontFamily:"'Inter','Segoe UI',system-ui,sans-serif",color:C.text,maxWidth:430,margin:"0 auto",paddingBottom:84,transition:"background .3s,color .3s"},
    card:{background:C.card,borderRadius:16,padding:16,marginBottom:12,border:`1px solid ${C.border}`,boxShadow:dark?"0 4px 24px rgba(0,0,0,.35)":"0 2px 12px rgba(0,0,0,.07)"},
    inp:{background:C.input,border:`1.5px solid ${C.border}`,borderRadius:10,padding:"10px 14px",color:C.text,fontSize:15,width:"100%",outline:"none",boxSizing:"border-box",fontFamily:"inherit",transition:"border .2s"},
    lbl:{fontSize:11,fontWeight:700,color:C.sub,marginBottom:5,display:"block",textTransform:"uppercase",letterSpacing:.7},
    btn:{background:"linear-gradient(135deg,#6366f1,#8b5cf6)",color:"#fff",border:"none",borderRadius:12,padding:"13px",fontSize:15,fontWeight:700,cursor:"pointer",width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:8,fontFamily:"inherit"},
    pill:(a)=>({background:a?C.accent:"transparent",color:a?"#fff":C.sub,border:`1.5px solid ${a?C.accent:C.border}`,borderRadius:20,padding:"6px 14px",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit",transition:"all .2s"}),
    nav:{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:430,background:C.card,borderTop:`1px solid ${C.border}`,display:"flex",zIndex:99,boxShadow:"0 -4px 20px rgba(0,0,0,.1)"},
    navBtn:(a)=>({flex:1,padding:"10px 4px 8px",display:"flex",flexDirection:"column",alignItems:"center",gap:3,cursor:"pointer",color:a?C.accent:C.sub,fontSize:10,fontWeight:a?700:500,background:"none",border:"none",fontFamily:"inherit",transition:"color .2s"}),
  };

  const props={S,C,dark,config,setConfig,registros,setRegistros,feriados,setFeriados,valorHora,registrosComCalc,totals,fmt,fmtDate,minToHHMM,calcDay,isDomingo,isFeriadoNacional};

  return (
    <div style={S.wrap}>
      {/* HEADER */}
      <div style={{background:"linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%)",padding:"20px 20px 28px",borderRadius:"0 0 28px 28px",marginBottom:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <div style={{fontSize:10,color:"rgba(255,255,255,.65)",fontWeight:700,letterSpacing:2,textTransform:"uppercase"}}>HoraExtra Pro • CLT</div>
            <div style={{fontSize:24,fontWeight:800,color:"#fff",marginTop:3,letterSpacing:"-.5px"}}>Minha Jornada</div>
          </div>
          <button onClick={()=>setDark(!dark)} style={{background:"rgba(255,255,255,.15)",border:"none",borderRadius:10,padding:9,cursor:"pointer",backdropFilter:"blur(4px)"}}>
            <Icon name={dark?"sun":"moon"} size={18} color="#fff"/>
          </button>
        </div>
        <div style={{display:"flex",gap:10,marginTop:18}}>
          {[["Extras acumuladas",minToHHMM(totals.extra50+totals.extra100)],["A receber",fmt(totals.val50+totals.val100)]].map(([l,v])=>(
            <div key={l} style={{flex:1,background:"rgba(255,255,255,.13)",borderRadius:14,padding:"12px 14px",backdropFilter:"blur(4px)"}}>
              <div style={{fontSize:10,color:"rgba(255,255,255,.7)",fontWeight:600}}>{l}</div>
              <div style={{fontSize:20,fontWeight:800,color:"#fff",marginTop:2}}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{padding:"0 16px"}}>
        {tab==="dashboard"&&<Dashboard {...props}/>}
        {tab==="ponto"&&<Ponto {...props}/>}
        {tab==="relatorio"&&<Relatorio {...props}/>}
        {tab==="config"&&<Config {...props}/>}
      </div>

      {/* NAV BAR */}
      <div style={S.nav}>
        {[["dashboard","home","Início"],["ponto","plus","Registrar"],["relatorio","chart","Relatório"],["config","settings","Config"]].map(([id,icon,lbl])=>(
          <button key={id} style={S.navBtn(tab===id)} onClick={()=>setTab(id)}>
            <Icon name={icon} size={tab===id?22:19}/>
            <span>{lbl}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════ DASHBOARD ══════════════════════════════════ */
function Dashboard({S,C,totals,registrosComCalc,valorHora,config,fmt,fmtDate,minToHHMM}) {
  const last7=[...registrosComCalc].slice(-7);
  const labels=["D","S","T","Q","Q","S","S"];
  const chartData=Array.from({length:7},(_,i)=>{
    const r=last7[i];
    const lbl=r?labels[new Date(r.data+"T12:00:00").getDay()]:labels[i];
    return {label:lbl,value:r?.calc?(r.calc.extra50+r.calc.extra100)/60:0};
  });
  const sal=parseFloat(config.salario)||0;
  const totalExt=totals.val50+totals.val100;
  const dsr=totalExt*.1667;
  const projecao=sal+totalExt+dsr;

  return (
    <div>
      {/* KPI extras */}
      <div style={{display:"flex",gap:10,marginBottom:12}}>
        {[[C.yellow,"📈","Extras 50%",totals.extra50,totals.val50],[C.red,"🔥","Extras 100%",totals.extra100,totals.val100]].map(([cor,e,l,h,v])=>(
          <div key={l} style={{...S.card,flex:1,marginBottom:0,borderTop:`3px solid ${cor}`,paddingTop:12,paddingBottom:12}}>
            <div style={{fontSize:10,color:C.sub,fontWeight:700}}>{e} {l}</div>
            <div style={{fontSize:20,fontWeight:800,color:cor,marginTop:3}}>{minToHHMM(h)}</div>
            <div style={{fontSize:13,color:C.sub,marginTop:1,fontWeight:600}}>{fmt(v)}</div>
          </div>
        ))}
      </div>

      {/* projeção */}
      <div style={{...S.card,background:C.bg,border:`1.5px solid ${C.accent}33`}}>
        <div style={{fontSize:10,color:C.accent,fontWeight:700,letterSpacing:.5,marginBottom:10}}>💰 PROJEÇÃO DE PAGAMENTO</div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:6}}>
          {[[sal,"Salário base",C.text],[totalExt+dsr,"Extras + DSR",C.green],[projecao,"TOTAL",C.accent]].map(([v,l,cor],i)=>(
            <div key={l} style={{flex:1,textAlign:"center",...(i===2?{background:C.accent+"18",borderRadius:12,padding:"8px 4px"}:{})}}>
              <div style={{fontSize:9,color:i===2?C.accent:C.sub,fontWeight:700,textTransform:"uppercase"}}>{l}</div>
              <div style={{fontSize:i===2?17:14,fontWeight:800,color:cor,marginTop:2}}>{fmt(v)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* gráfico */}
      <div style={S.card}>
        <div style={{fontSize:13,fontWeight:700,marginBottom:2}}>📊 Extras por dia — últimos registros</div>
        <div style={{fontSize:10,color:C.sub,marginBottom:8}}>em horas</div>
        <BarChart data={chartData} textColor={C.sub}/>
      </div>

      {/* reflexos */}
      <div style={S.card}>
        <div style={{fontSize:13,fontWeight:700,marginBottom:10}}>🔢 Reflexos Estimados</div>
        {[["DSR s/ extras",dsr,C.yellow,""],["Férias + 1/3",( sal+totalExt)/12*(4/3),C.green,"🏖️"],["13º Salário",(sal+totalExt)/12,C.accent,"🎄"],["FGTS 8%",projecao*.08,C.purple,"🏦"]].map(([l,v,cor,e])=>(
          <div key={l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${C.border}`}}>
            <span style={{fontSize:13,color:C.sub}}>{e} {l}</span>
            <span style={{fontSize:14,fontWeight:700,color:cor}}>{fmt(v)}</span>
          </div>
        ))}
      </div>

      {/* últimos */}
      <div style={S.card}>
        <div style={{fontSize:13,fontWeight:700,marginBottom:10}}>📋 Últimos Registros</div>
        {registrosComCalc.length===0?(
          <div style={{textAlign:"center",padding:"24px 0",color:C.sub}}>
            <div style={{fontSize:36,marginBottom:8}}>⏰</div>
            <div style={{fontSize:13}}>Nenhum registro ainda.<br/>Toque em <b>Registrar</b> para começar.</div>
          </div>
        ):[...registrosComCalc].reverse().slice(0,5).map((r,i)=>(
          <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 0",borderBottom:`1px solid ${C.border}`}}>
            <div>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <span style={{fontSize:13,fontWeight:600}}>{fmtDate(new Date(r.data+"T12:00:00"))}</span>
                {r.isSpecial&&<span style={{background:C.red+"22",color:C.red,borderRadius:5,padding:"1px 6px",fontSize:10,fontWeight:700}}>100%</span>}
              </div>
              <div style={{fontSize:11,color:C.sub,marginTop:1}}>{r.entrada} → {r.saida}</div>
            </div>
            {r.calc&&<div style={{textAlign:"right"}}>
              <div style={{fontSize:15,fontWeight:700,color:C.green}}>{fmt(r.calc.total)}</div>
              <div style={{fontSize:11,color:C.sub}}>{minToHHMM(r.calc.extra50+r.calc.extra100)} ext.</div>
            </div>}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═════════════════════════════════ PONTO ════════════════════════════════════ */
function Ponto({S,C,registros,setRegistros,feriados,config,valorHora,fmt,fmtDate,minToHHMM,calcDay,isDomingo,isFeriadoNacional}) {
  const today=new Date().toISOString().split("T")[0];
  const [form,setForm]=useState({data:today,entrada:"",saida:"",intervalo:"60",obs:""});
  const [preview,setPreview]=useState(null);
  const upd=(k,v)=>setForm(f=>({...f,[k]:v}));

  useEffect(()=>{
    const dt=new Date(form.data+"T12:00:00");
    const isSp=isDomingo(dt)||isFeriadoNacional(dt)||feriados.includes(form.data);
    const c=calcDay(form.entrada,form.saida,form.intervalo,config.jornadaDiaria,valorHora,isSp);
    setPreview(c?{...c,isSpecial:isSp}:null);
  },[form,config,valorHora,feriados]);

  const save=()=>{
    if(!form.entrada||!form.saida){alert("Preencha entrada e saída!");return;}
    const idx=registros.findIndex(r=>r.data===form.data);
    if(idx>=0){const u=[...registros];u[idx]={...form};setRegistros(u);}
    else setRegistros([...registros,{...form}]);
    setForm(f=>({...f,entrada:"",saida:"",obs:""}));
  };

  const remove=(data)=>{if(confirm("Remover este registro?"))setRegistros(registros.filter(r=>r.data!==data));};

  return (
    <div>
      <div style={S.card}>
        <div style={{fontSize:13,fontWeight:700,color:C.accent,marginBottom:14}}>⏱️ NOVO REGISTRO DE PONTO</div>

        <div style={{marginBottom:12}}>
          <label style={S.lbl}>Data</label>
          <input type="date" value={form.data} onChange={e=>upd("data",e.target.value)} style={S.inp}/>
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

        {/* PREVIEW */}
        {preview&&(
          <div style={{background:C.bg,borderRadius:12,padding:14,marginBottom:14,border:`1px solid ${C.border}`}}>
            <div style={{fontSize:10,fontWeight:700,color:C.sub,letterSpacing:.5,marginBottom:10}}>PRÉ-VISUALIZAÇÃO</div>
            {preview.isSpecial&&(
              <div style={{background:C.red+"15",color:C.red,borderRadius:8,padding:"7px 10px",fontSize:12,fontWeight:600,marginBottom:10}}>
                ⚠️ Domingo / Feriado — adicional 100% aplicado automaticamente
              </div>
            )}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
              {[["⏳ Trabalhado",minToHHMM(preview.worked),C.text],["📌 Normal",minToHHMM(preview.normal),C.sub],["📈 Extra 50%",minToHHMM(preview.extra50),C.yellow],["🔥 Extra 100%",minToHHMM(preview.extra100),C.red]].map(([l,v,c])=>(
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
        <button onClick={save} style={S.btn}><Icon name="check" size={18} color="#fff"/> Salvar Registro</button>
      </div>

      {/* HISTÓRICO */}
      <div style={S.card}>
        <div style={{fontSize:13,fontWeight:700,marginBottom:12}}>📋 Histórico ({registros.length} registros)</div>
        {registros.length===0&&<div style={{textAlign:"center",padding:16,color:C.sub,fontSize:13}}>Sem registros.</div>}
        {[...registros].sort((a,b)=>b.data.localeCompare(a.data)).map((r,i)=>{
          const dt=new Date(r.data+"T12:00:00");
          const isSp=isDomingo(dt)||isFeriadoNacional(dt)||feriados.includes(r.data);
          const c=calcDay(r.entrada,r.saida,r.intervalo,config.jornadaDiaria,valorHora,isSp);
          return (
            <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${C.border}`}}>
              <div>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontSize:13,fontWeight:600}}>{fmtDate(dt)}</span>
                  {isSp&&<span style={{background:C.red+"22",color:C.red,borderRadius:5,padding:"1px 6px",fontSize:10,fontWeight:700}}>FERIADO</span>}
                </div>
                <div style={{fontSize:11,color:C.sub,marginTop:1}}>{r.entrada} → {r.saida} · {r.intervalo}min</div>
                {r.obs&&<div style={{fontSize:11,color:C.sub,fontStyle:"italic"}}>"{r.obs}"</div>}
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                {c&&<div style={{textAlign:"right"}}>
                  <div style={{fontSize:14,fontWeight:700,color:C.green}}>{fmt(c.total)}</div>
                  <div style={{fontSize:10,color:C.sub}}>{minToHHMM(c.extra50+c.extra100)} ext.</div>
                </div>}
                <button onClick={()=>remove(r.data)} style={{background:"none",border:"none",cursor:"pointer",padding:6,borderRadius:8}}>
                  <Icon name="trash" size={15} color={C.red}/>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ══════════════════════════════ RELATÓRIO ═══════════════════════════════════ */
function Relatorio({S,C,registrosComCalc,totals,config,valorHora,fmt,fmtDate,minToHHMM}) {
  const sal=parseFloat(config.salario)||0;
  const totalExt=totals.val50+totals.val100;
  const dsr=totalExt*.1667;

  const byMonth={};
  registrosComCalc.forEach(r=>{
    const m=r.data.substring(0,7);
    if(!byMonth[m]) byMonth[m]={extra50:0,extra100:0,val50:0,val100:0,worked:0,days:0};
    if(r.calc){byMonth[m].extra50+=r.calc.extra50;byMonth[m].extra100+=r.calc.extra100;byMonth[m].val50+=r.calc.val50;byMonth[m].val100+=r.calc.val100;byMonth[m].worked+=r.calc.worked;byMonth[m].days++;}
  });
  const months=Object.entries(byMonth).sort((a,b)=>b[0].localeCompare(a[0]));

  const exportTxt=()=>{
    let t="===== RELATÓRIO HORA EXTRA PRO =====\n";
    t+=`Data: ${new Date().toLocaleDateString("pt-BR")}\n\n`;
    t+=`Salário Base: ${fmt(sal)}\nGratificações: ${fmt(parseFloat(config.gratificacoes)||0)}\n`;
    t+=`Valor da hora: ${fmt(valorHora)}\nJornada: ${config.jornadaDiaria}min/dia | ${config.jornadaMensal}h/mês | ${config.escala}\n\n`;
    t+="===== ACUMULADO =====\n";
    t+=`Extras 50%: ${minToHHMM(totals.extra50)} = ${fmt(totals.val50)}\n`;
    t+=`Extras 100%: ${minToHHMM(totals.extra100)} = ${fmt(totals.val100)}\n`;
    t+=`DSR estimado: ${fmt(dsr)}\nTOTAL: ${fmt(totalExt+dsr)}\n\n`;
    t+="===== POR MÊS =====\n";
    months.forEach(([m,d])=>{
      t+=`\n${new Date(m+"-15").toLocaleDateString("pt-BR",{month:"long",year:"numeric"})}\n`;
      t+=`  Dias: ${d.days} | E50: ${minToHHMM(d.extra50)} | E100: ${minToHHMM(d.extra100)}\n`;
      t+=`  Valor: ${fmt(d.val50+d.val100)}\n`;
    });
    t+="\n===== REGISTROS DETALHADOS =====\n";
    registrosComCalc.forEach(r=>{
      if(!r.calc) return;
      t+=`${r.data} | ${r.entrada}-${r.saida} | ${minToHHMM(r.calc.extra50+r.calc.extra100)} | ${fmt(r.calc.total)}${r.isSpecial?" [FERIADO]":""}\n`;
    });
    const blob=new Blob([t],{type:"text/plain;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=url;a.download="relatorio_horas_extras.txt";a.click();
    URL.revokeObjectURL(url);
  };

  const shareWpp=()=>{
    const msg=`*RELATÓRIO HORA EXTRA PRO* 📊\n\nExtras 50%: ${minToHHMM(totals.extra50)} = ${fmt(totals.val50)}\nExtras 100%: ${minToHHMM(totals.extra100)} = ${fmt(totals.val100)}\nDSR: ${fmt(dsr)}\n\n*💰 TOTAL A RECEBER: ${fmt(totalExt+dsr)}*\n\n_HoraExtra Pro • CLT_`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`,"_blank");
  };

  return (
    <div>
      <div style={{...S.card,border:`1.5px solid ${C.green}33`,background:C.bg}}>
        <div style={{fontSize:10,color:C.green,fontWeight:700,letterSpacing:.5,marginBottom:10}}>📄 RESUMO GERAL ACUMULADO</div>
        {[["📈 Extras 50%",minToHHMM(totals.extra50),fmt(totals.val50),C.yellow,false],["🔥 Extras 100%",minToHHMM(totals.extra100),fmt(totals.val100),C.red,false],["📅 DSR estimado","—",fmt(dsr),C.accent,false],["💰 TOTAL A RECEBER",minToHHMM(totals.extra50+totals.extra100),fmt(totalExt+dsr),C.green,true]].map(([l,h,v,c,bold])=>(
          <div key={l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 0",borderBottom:`1px solid ${C.border}`}}>
            <div>
              <div style={{fontSize:bold?14:13,fontWeight:bold?700:500,color:bold?c:C.text}}>{l}</div>
              <div style={{fontSize:11,color:C.sub}}>{h}</div>
            </div>
            <span style={{fontSize:bold?20:15,fontWeight:700,color:c}}>{v}</span>
          </div>
        ))}
      </div>

      {months.length===0&&(
        <div style={{...S.card,textAlign:"center",padding:32}}>
          <div style={{fontSize:36,marginBottom:8}}>📊</div>
          <div style={{color:C.sub,fontSize:13}}>Sem dados. Registre suas horas.</div>
        </div>
      )}

      {months.map(([m,d])=>(
        <div key={m} style={S.card}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:12}}>
            📅 {new Date(m+"-15").toLocaleDateString("pt-BR",{month:"long",year:"numeric"}).replace(/^\w/,c=>c.toUpperCase())}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
            {[["Dias",d.days+"d",C.text],["Total",minToHHMM(d.worked),C.text],["Extra 50%",fmt(d.val50),C.yellow],["Extra 100%",fmt(d.val100),C.red]].map(([l,v,c])=>(
              <div key={l} style={{background:C.bg,borderRadius:10,padding:"9px 12px",border:`1px solid ${C.border}`}}>
                <div style={{fontSize:10,color:C.sub,fontWeight:600}}>{l}</div>
                <div style={{fontSize:14,fontWeight:700,color:c,marginTop:2}}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{background:C.green+"15",borderRadius:10,padding:"9px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:12,fontWeight:700,color:C.green}}>Total do mês</span>
            <span style={{fontSize:18,fontWeight:800,color:C.green}}>{fmt(d.val50+d.val100)}</span>
          </div>
        </div>
      ))}

      <div style={S.card}>
        <div style={{fontSize:13,fontWeight:700,marginBottom:12}}>📤 Exportar Relatório</div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <button onClick={exportTxt} style={S.btn}>📄 Baixar Relatório (.txt)</button>
          <button onClick={shareWpp} style={{...S.btn,background:"linear-gradient(135deg,#25D366,#128C7E)"}}>📱 Compartilhar via WhatsApp</button>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════ CONFIG ════════════════════════════════════ */
function Config({S,C,config,setConfig,feriados,setFeriados}) {
  const [novoF,setNovoF]=useState("");
  const upd=(k,v)=>setConfig({...config,[k]:v});
  const addF=()=>{if(novoF&&!feriados.includes(novoF)){setFeriados([...feriados,novoF]);setNovoF("");}};
  const sal=(parseFloat(config.salario)||0)+(parseFloat(config.gratificacoes)||0);
  const vh=config.jornadaMensal>0?sal/config.jornadaMensal:0;

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
        <div style={{background:C.green+"12",borderRadius:12,padding:14,border:`1.5px solid ${C.green}33`,marginTop:4}}>
          <div style={{fontSize:10,color:C.sub,fontWeight:700,letterSpacing:.5}}>VALOR DA HORA CALCULADO</div>
          <div style={{fontSize:28,fontWeight:800,color:C.green,marginTop:4}}>{vh>0?`R$ ${vh.toFixed(2)}/h`:"Configure →"}</div>
          <div style={{fontSize:11,color:C.sub,marginTop:3}}>(Sal. + Grat.) ÷ {config.jornadaMensal}h = hora normal</div>
          {vh>0&&<>
            <div style={{fontSize:12,color:C.yellow,marginTop:4,fontWeight:600}}>📈 50%: R$ {(vh*1.5).toFixed(2)}/h</div>
            <div style={{fontSize:12,color:C.red,marginTop:2,fontWeight:600}}>🔥 100%: R$ {(vh*2).toFixed(2)}/h</div>
          </>}
        </div>
      </div>

      {/* JORNADA */}
      <div style={S.card}>
        <div style={{fontSize:13,fontWeight:700,color:C.accent,marginBottom:14}}>⏱️ JORNADA DE TRABALHO</div>
        <div style={{marginBottom:14}}>
          <label style={S.lbl}>Horas mensais contratadas</label>
          <div style={{display:"flex",gap:8}}>
            {[220,180,200].map(h=>(
              <button key={h} onClick={()=>upd("jornadaMensal",h)} style={{...S.pill(config.jornadaMensal===h),flex:1}}>{h}h/mês</button>
            ))}
          </div>
        </div>
        <div style={{marginBottom:14}}>
          <label style={S.lbl}>Jornada diária (minutos)</label>
          <input type="number" value={config.jornadaDiaria} onChange={e=>upd("jornadaDiaria",parseInt(e.target.value)||480)} style={S.inp}/>
          <div style={{fontSize:11,color:C.sub,marginTop:4}}>{Math.floor(config.jornadaDiaria/60)}h{config.jornadaDiaria%60>0?" "+config.jornadaDiaria%60+"min":""} por dia</div>
        </div>
        <div>
          <label style={S.lbl}>Escala de trabalho</label>
          <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
            {["5x2","6x1","12x36","Personalizada"].map(e=>(
              <button key={e} onClick={()=>upd("escala",e)} style={S.pill(config.escala===e)}>{e}</button>
            ))}
          </div>
        </div>
      </div>

      {/* FECHAMENTO */}
      <div style={S.card}>
        <div style={{fontSize:13,fontWeight:700,color:C.accent,marginBottom:14}}>📅 FECHAMENTO DO PONTO</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
          <div>
            <label style={S.lbl}>Ponto fecha dia</label>
            <input type="number" min="1" max="31" value={config.fechamentoPonto} onChange={e=>upd("fechamentoPonto",parseInt(e.target.value)||20)} style={S.inp}/>
          </div>
          <div>
            <label style={S.lbl}>Extras fecham dia</label>
            <input type="number" min="1" max="31" value={config.fechamentoExtras} onChange={e=>upd("fechamentoExtras",parseInt(e.target.value)||15)} style={S.inp}/>
          </div>
        </div>
        <div style={{background:C.bg,borderRadius:10,padding:10,fontSize:12,color:C.sub,border:`1px solid ${C.border}`}}>
          ℹ️ Ponto fecha dia <b>{config.fechamentoPonto}</b> · Extras fecham dia <b>{config.fechamentoExtras}</b>
        </div>
      </div>

      {/* FERIADOS */}
      <div style={S.card}>
        <div style={{fontSize:13,fontWeight:700,color:C.accent,marginBottom:6}}>🗓️ FERIADOS LOCAIS</div>
        <div style={{fontSize:11,color:C.sub,marginBottom:12,lineHeight:1.5}}>
          Feriados nacionais cadastrados automaticamente.<br/>Adicione feriados municipais/estaduais abaixo:
        </div>
        <div style={{display:"flex",gap:8,marginBottom:12}}>
          <input type="date" value={novoF} onChange={e=>setNovoF(e.target.value)} style={{...S.inp,flex:1}}/>
          <button onClick={addF} style={{background:C.accent,border:"none",borderRadius:10,padding:"0 14px",cursor:"pointer",display:"flex",alignItems:"center",height:44}}>
            <Icon name="plus" size={18} color="#fff"/>
          </button>
        </div>
        {feriados.length===0&&<div style={{textAlign:"center",padding:12,color:C.sub,fontSize:12}}>Nenhum feriado local cadastrado.</div>}
        {[...feriados].sort().map(d=>(
          <div key={d} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${C.border}`}}>
            <span style={{fontSize:13}}>{new Date(d+"T12:00:00").toLocaleDateString("pt-BR",{weekday:"short",day:"2-digit",month:"long",year:"numeric"})}</span>
            <button onClick={()=>setFeriados(feriados.filter(f=>f!==d))} style={{background:"none",border:"none",cursor:"pointer",padding:4}}>
              <Icon name="trash" size={15} color={C.red}/>
            </button>
          </div>
        ))}
      </div>

      <div style={{...S.card,textAlign:"center",background:C.accent+"10",border:`1.5px solid ${C.accent}33`}}>
        <div style={{fontSize:20,marginBottom:6}}>⚖️</div>
        <div style={{fontSize:12,color:C.sub,lineHeight:1.7}}>
          Cálculos baseados na <b>CLT</b> (Art. 59).<br/>
          Extra 50% após jornada normal · Extra 100% em domingos e feriados.<br/>
          <span style={{fontSize:10,display:"block",marginTop:4}}>Consulte seu sindicato para convenções coletivas.</span>
        </div>
      </div>
    </div>
  );
}
