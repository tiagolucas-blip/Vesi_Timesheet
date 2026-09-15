(function(){
  "use strict";

  var DAYS = ["Seg 14","Ter 15","Qua 16","Qui 17","Sex 18","Sáb 19","Dom 20"];
  var PROJECTS = [
    {code:"BNK-2026", wbs:"BNK-2026.1.3", name:"Banca, Payroll e ECP", act:"Consultoria funcional", proj:true,
     sap:{rproj:"BNK-2026.1.3", lstar:"CONS01", skostl:"PT4010", rkostl:"", aufnr:""}},
    {code:"RTL-TT", wbs:"RTL-TT.2.1", name:"Retalho, Time Tracking", act:"Consultoria funcional", proj:true,
     sap:{rproj:"RTL-TT.2.1", lstar:"CONS01", skostl:"PT4010", rkostl:"", aufnr:""}},
    {code:"AER-WFM", wbs:"AER-WFM.4.2", name:"Aeroportos, WFM rollout", act:"Gestão de projeto", proj:true,
     sap:{rproj:"AER-WFM.4.2", lstar:"PMGT01", skostl:"PT4010", rkostl:"", aufnr:""}},
    {code:"AXI-INT", wbs:"", name:"Interno, pré venda e formação", act:"Administrativo", proj:false,
     sap:{rproj:"", lstar:"ADMIN1", skostl:"PT4010", rkostl:"PT4010", aufnr:""}}
  ];
  var PERNR = "00104567";
  var WORKDATES = ["20260914","20260915","20260916","20260917","20260918","20260919","20260920"];
  var DAYCAP = 8;

  /* Ausências vindas do Leave Request, leitura apenas nesta aplicação */
  var ABSENCES = [
    {id:"ab1", day:2, type:"Consulta médica", awart:"0210", hours:4, status:"approved", src:"Pedido 4500219"},
    {id:"ab2", day:4, type:"Férias", awart:"0100", hours:8, status:"approved", src:"Pedido 4500221"},
    {id:"ab3", day:3, type:"Férias", awart:"0100", hours:8, status:"pending", src:"Pedido 4500230"}
  ];
  var ABSTATUS = {approved:"Aprovada", pending:"Pedido pendente"};

  function absOn(day, status){
    return ABSENCES.filter(function(a){ return a.day === day && (!status || a.status === status); });
  }
  function absHours(day){
    return absOn(day, "approved").reduce(function(s,a){ return s + a.hours; },0);
  }
  function capacity(day){
    if(day > 4) return 0;
    return Math.max(0, DAYCAP - absHours(day));
  }
  function isBlocked(day){ return day <= 4 && capacity(day) === 0; }
  function weekCapacity(){
    var c = 0;
    for(var i=0; i<5; i++) c += capacity(i);
    return c;
  }

  var state = {
    submitted:false,
    privateMode:false,
    rows:[
      {id:1, p:0, desc:"Workshop de requisitos, folha de vencimento", h:[3,4,0,2,0,0,0], origin:"Manual"},
      {id:2, p:1, desc:"Desenho da solução de registo de tempo", h:[2,0,3,0,0,0,0], origin:"Sugerida"},
      {id:3, p:3, desc:"", h:[1,0,0,1.5,0,0,0], origin:"Manual"}
    ],
    sugs:[
      {id:"s1", hours:2.5, day:2, p:2, why:"3 reuniões com o cliente no calendário", conf:"hi", desc:"Reuniões de acompanhamento do rollout"},
      {id:"s2", hours:1.5, day:3, p:1, why:"12 alterações no repositório do projeto", conf:"hi", desc:"Configuração de regras de tempo"},
      {id:"s3", hours:2, day:4, p:0, why:"4 tickets tratados em Cloud ALM", conf:"mid", desc:"Correções pós testes de folha"},
      {id:"s4", hours:1, day:4, p:3, why:"Bloco sem sinal atribuível", conf:"low", desc:""}
    ],
    approvals:[
      {who:"Ana Ferreira", role:"Consultora sénior", proj:"BNK-2026", tot:40, inproj:36, dev:0, warn:0, sel:false},
      {who:"Bruno Matos", role:"Consultor", proj:"RTL-TT", tot:38.5, inproj:34, dev:-1.5, warn:0, sel:false},
      {who:"Carla Nunes", role:"Consultora", proj:"AER-WFM", tot:40, inproj:40, dev:0, warn:0, sel:false},
      {who:"Diogo Sousa", role:"Consultor júnior", proj:"BNK-2026", tot:37, inproj:30, dev:-3, warn:0, sel:false},
      {who:"Eva Lopes", role:"Arquiteta", proj:"RTL-TT", tot:52, inproj:52, dev:12, warn:1, sel:false, note:"12 h acima do planeado"},
      {who:"Filipe Reis", role:"Consultor", proj:"AER-WFM", tot:24, inproj:18, dev:-16, warn:1, sel:false, note:"Dois dias úteis a zero"}
    ]
  };

  var $ = function(id){ return document.getElementById(id); };
  var nextId = 100;

  function fmt(n){ return (Math.round(n*100)/100).toFixed(1).replace(".", ","); }
  function parseDur(txt){
    if(!txt) return 0;
    var t = String(txt).trim().toLowerCase().replace(",", ".");
    if(!t) return 0;
    var m;
    if((m = t.match(/^(\d{1,2}):(\d{1,2})$/))) return (+m[1]) + (+m[2])/60;
    if((m = t.match(/^(\d+(?:\.\d+)?)\s*m(?:in)?$/))) return (+m[1])/60;
    if((m = t.match(/^(\d+(?:\.\d+)?)\s*h?$/))) return +m[1];
    return NaN;
  }
  function round15(v){ return Math.round(v*4)/4; }

  function rowTotal(r){ return r.h.reduce(function(a,b){ return a+(b||0); },0); }
  function dayTotal(d){ return state.rows.reduce(function(a,r){ return a+(r.h[d]||0); },0); }
  function weekTotal(){ return state.rows.reduce(function(a,r){ return a+rowTotal(r); },0); }
  function projTotal(){
    return state.rows.reduce(function(a,r){ return a + (PROJECTS[r.p].proj ? rowTotal(r) : 0); },0);
  }

  /* ---------- validation ---------- */
  function validate(){
    var out = [];
    for(var d=0; d<7; d++){
      if(dayTotal(d) > 24) out.push({sev:"e", txt:"O total de "+DAYS[d]+" excede 24 horas.", day:d});
    }
    state.rows.forEach(function(r){
      if(PROJECTS[r.p].proj && rowTotal(r) > 0 && r.desc.trim().length < 10){
        out.push({sev:"e", txt:"Entradas de projeto precisam de descrição: "+PROJECTS[r.p].code+".", row:r.id});
      }
    });
    /* conflitos com ausências */
    for(var a=0; a<5; a++){
      var cap = capacity(a), tot = dayTotal(a);
      if(tot === 0) continue;
      if(cap === 0){
        out.push({sev:"e", day:a, conflict:a,
          txt:DAYS[a]+" tem "+absOn(a,"approved")[0].type.toLowerCase()+" aprovada. As "+fmt(tot)+" h registadas têm de sair deste dia."});
      } else if(tot > cap){
        out.push({sev:"e", day:a,
          txt:DAYS[a]+" tem ausência parcial aprovada. A capacidade do dia é "+fmt(cap)+" h e estão registadas "+fmt(tot)+" h."});
      }
    }
    for(var p=0; p<5; p++){
      if(absOn(p,"pending").length && dayTotal(p) > 0){
        out.push({sev:"w", day:p, txt:DAYS[p]+" tem um pedido de ausência pendente e horas registadas. Se o pedido for aprovado, estas horas entram em conflito."});
      }
    }
    for(var i=0; i<5; i++){
      if(capacity(i) > 0 && dayTotal(i) === 0) out.push({sev:"w", txt:DAYS[i]+" está a zero.", day:i});
    }
    var expect = weekCapacity();
    if(weekTotal() > 0 && weekTotal() < expect) out.push({sev:"w", txt:"A semana tem "+fmt(weekTotal())+" h registadas, o esperado com as ausências descontadas é "+fmt(expect)+" h."});
    var pend = visibleSugs().length;
    if(pend > 0 && !state.privateMode) out.push({sev:"i", txt:pend+" sugestões ainda por rever no painel lateral."});
    return out;
  }
  function errors(){ return validate().filter(function(m){ return m.sev === "e"; }); }

  /* ---------- render: grid ---------- */
  function renderGrid(){
    var g = $("tsgrid");
    g.innerHTML = "";

    var head = document.createElement("div");
    head.className = "row head";
    head.appendChild(el("div","","Projeto, WBS e atividade"));
    DAYS.forEach(function(d,i){
      var c = el("div", i>4?"we":"", "");
      c.appendChild(el("span","", d));
      var ap = absOn(i,"approved")[0], pe = absOn(i,"pending")[0];
      if(ap) c.appendChild(el("span","dayabs" + (capacity(i) === 0 ? " full" : ""), capacity(i) === 0 ? ap.type : "meio dia"));
      else if(pe) c.appendChild(el("span","dayabs pend", "pendente"));
      head.appendChild(c);
    });
    head.appendChild(el("div","","Total"));
    head.appendChild(el("div","",""));
    g.appendChild(head);

    if(state.rows.length === 0){
      var e = document.createElement("div");
      e.className = "empty";
      e.innerHTML = '<p><strong>Ainda sem horas nesta semana.</strong> Comece pelo caminho mais curto.</p>';
      var acts = el("div","acts","");
      acts.appendChild(btn("Copiar a semana passada","btn primary", copyWeek));
      acts.appendChild(btn("Rever "+state.sugs.length+" sugestões","btn", function(){ $("sugPanel").scrollIntoView({block:"center"}); }));
      acts.appendChild(btn("Adicionar o primeiro projeto","btn", addRow));
      e.appendChild(acts);
      g.appendChild(e);
    }

    state.rows.forEach(function(r){
      var pr = PROJECTS[r.p];
      var row = document.createElement("div");
      row.className = "row" + (state.submitted ? " locked" : "");

      var meta = el("div","rowmeta","");
      var p = el("div","p","");
      p.appendChild(el("span","", pr.name));
      var c = document.createElement("code"); c.textContent = pr.wbs || pr.sap.rkostl; p.appendChild(c);
      p.appendChild(el("span","bill" + (pr.proj?"":" no"), pr.proj ? "PEP" : "INTERNO"));
      meta.appendChild(p);
      var needDesc = pr.proj && rowTotal(r) > 0 && r.desc.trim().length < 10;
      var s = el("div","s", (r.desc || (needDesc ? "Descrição obrigatória" : "Sem descrição")) + " · " + pr.act);
      if(needDesc) s.style.color = "var(--crit)";
      meta.appendChild(s);
      meta.style.cursor = "pointer";
      meta.onclick = function(){ openDetail(r); };
      row.appendChild(meta);

      r.h.forEach(function(v,i){
        var inp = document.createElement("input");
        inp.type = "text";
        inp.className = "cell" + (i>4 ? " we" : "");
        inp.id = "c-"+r.id+"-"+i;
        inp.value = v ? fmt(v) : "";
        inp.inputMode = "decimal";
        inp.setAttribute("aria-label","Duração em horas, "+pr.name+", "+DAYS[i]);
        inp.disabled = state.submitted || (isBlocked(i) && !v);
        if(isBlocked(i)){
          inp.classList.add("abs");
          inp.title = absOn(i,"approved")[0].type + " aprovada, dia não disponível para registo";
        } else if(absHours(i) > 0){
          inp.title = "Ausência parcial aprovada, capacidade de " + fmt(capacity(i)) + " h neste dia";
        }
        inp.addEventListener("change", function(){
          var parsed = parseDur(inp.value);
          if(isNaN(parsed)){ toast("Não consegui ler “"+inp.value+"”. Use 1,5 ou 1:30 ou 90m."); inp.value = v ? fmt(v) : ""; return; }
          r.h[i] = round15(parsed);
          render();
        });
        inp.addEventListener("keydown", function(ev){
          if(ev.key === "Enter" && !ev.ctrlKey && !ev.metaKey){
            ev.preventDefault(); inp.blur();
            var idx = state.rows.indexOf(r);
            var nxt = state.rows[idx+1];
            setTimeout(function(){
              var t = nxt ? document.getElementById("c-"+nxt.id+"-"+i) : document.getElementById("c-"+r.id+"-"+Math.min(i+1,6));
              if(t) t.focus();
            },0);
          }
        });
        row.appendChild(inp);
      });

      row.appendChild(el("div","rowtot", rowTotal(r) ? fmt(rowTotal(r)) : "–"));
      var act = el("div","rowact","");
      var rm = btn("×","", function(){
        state.rows = state.rows.filter(function(x){ return x.id !== r.id; });
        render(); toast("Linha removida.", "Desfazer", function(){ state.rows.push(r); render(); });
      });
      rm.setAttribute("aria-label","Remover linha "+pr.name);
      rm.disabled = state.submitted;
      act.appendChild(rm);
      row.appendChild(act);
      g.appendChild(row);
    });

    if(state.rows.length){
      var tr = document.createElement("div");
      tr.className = "row totals";
      tr.appendChild(el("div","rowmeta","Total por dia"));
      for(var d=0; d<7; d++){
        var v = dayTotal(d), cap = capacity(d);
        var cls = "t";
        if(v > 24 || (d < 5 && v > cap)) cls += " over";
        else if(v === 0 && d < 5 && cap > 0) cls += " zero";
        else if(d < 5 && cap === 0) cls += " off";
        tr.appendChild(el("div", cls, d < 5 && cap === 0 && !v ? "–" : (v ? fmt(v) : "0,0")));
      }
      tr.appendChild(el("div","t", fmt(weekTotal())));
      tr.appendChild(el("div","",""));
      g.appendChild(tr);
    }
  }

  /* ---------- render: calendar ---------- */
  function renderCal(){
    var cal = $("cal");
    cal.innerHTML = "";
    cal.appendChild(el("div","ch","Hora"));
    for(var i=0; i<5; i++) cal.appendChild(el("div","ch", DAYS[i]));

    var hours = el("div","hours","");
    for(var h=9; h<19; h++){ hours.appendChild(el("span","", h+":00")); }
    cal.appendChild(hours);

    for(var d=0; d<5; d++){
      var col = el("div","col","");
      absOn(d).forEach(function(a){
        var ab = el("div","blk abs" + (a.status === "pending" ? " pend" : ""), "");
        ab.style.minHeight = Math.max(30, a.hours*26) + "px";
        ab.innerHTML = "<b>"+fmt(a.hours)+" h</b>"+a.type+" · "+ABSTATUS[a.status];
        ab.title = a.src + ", AWART " + a.awart;
        col.appendChild(ab);
      });
      if(d === 1){
        var ext = document.createElement("button");
        ext.className = "blk ext";
        ext.innerHTML = "<b>1,0 h</b>Comité de projeto, cliente externo · converter";
        ext.onclick = (function(day){ return function(){ openQuick("1h AER comité de projeto", day); }; })(d);
        col.appendChild(ext);
      }
      state.rows.forEach(function(r){
        var v = r.h[d];
        if(!v) return;
        var pr = PROJECTS[r.p];
        var b = document.createElement("button");
        b.className = "blk" + (pr.proj ? "" : " nb");
        b.style.minHeight = Math.max(30, v*26) + "px";
        b.innerHTML = "<b>"+fmt(v)+" h</b>"+pr.code+" · "+(r.desc || pr.act);
        b.onclick = function(){ openDetail(r); };
        col.appendChild(b);
      });
      if(!isBlocked(d)){
        var free = document.createElement("button");
        free.className = "calfree";
        free.textContent = "+ registar";
        free.onclick = (function(day){ return function(){ openQuick("", day); }; })(d);
        col.appendChild(free);
      } else {
        col.appendChild(el("div","calfree off","dia não disponível"));
      }
      cal.appendChild(col);
    }
  }

  /* ---------- render: suggestions ---------- */
  var CONF = {hi:"confiança alta", mid:"confiança média", low:"confiança baixa"};
  function visibleSugs(){
    return state.sugs.filter(function(s){ return !isBlocked(s.day); });
  }
  function renderSugs(){
    var box = $("sugs");
    box.innerHTML = "";
    var vis = visibleSugs();
    var hidden = state.sugs.length - vis.length;
    $("acceptHi").disabled = state.privateMode || !vis.some(function(s){ return s.conf === "hi"; });

    if(state.privateMode){
      var p = el("div","paused","");
      p.innerHTML = "<strong>Modo privado ativo.</strong><span>A captura de sinais está em pausa. Nada é recolhido enquanto este modo estiver ligado.</span>";
      p.appendChild(btn("Retomar sugestões","btn", togglePrivate));
      box.appendChild(p);
      return;
    }
    if(vis.length === 0){
      box.appendChild(el("div","paused", hidden ? "Nada a propor. As sugestões que existiam caíam em dias com ausência aprovada." : "Sem sugestões pendentes. Bom sinal, a semana está revista."));
      return;
    }
    if(hidden){
      box.appendChild(el("div","msg i", hidden + (hidden === 1 ? " sugestão descartada" : " sugestões descartadas") + " por caírem em dias com ausência aprovada."));
    }
    vis.forEach(function(s){
      var pr = PROJECTS[s.p];
      var card = el("div","sug "+s.conf,"");
      var h = el("div","h","");
      var b = document.createElement("b"); b.textContent = fmt(s.hours)+" h"; h.appendChild(b);
      h.appendChild(el("span","", DAYS[s.day]));
      card.appendChild(h);
      card.appendChild(el("div","", pr.name));
      card.appendChild(el("div","why", s.why));
      card.appendChild(el("div","conf", CONF[s.conf]));
      var acts = el("div","acts","");
      acts.appendChild(btn("Aceitar","btn sm primary", function(){ acceptSug(s); }));
      acts.appendChild(btn("Editar","btn sm", function(){ openQuick(fmt(s.hours)+"h "+pr.code+" "+(s.desc||""), s.day); }));
      acts.appendChild(btn("Dispensar","btn sm ghost", function(){ dropSug(s, true); }));
      card.appendChild(acts);
      box.appendChild(card);
    });
  }
  function acceptSug(s){
    if(isBlocked(s.day)){ toast(DAYS[s.day]+" tem ausência aprovada, a sugestão não pode ser aplicada."); return; }
    var row = state.rows.filter(function(r){ return r.p === s.p; })[0];
    if(!row){ row = {id:nextId++, p:s.p, desc:s.desc, h:[0,0,0,0,0,0,0], origin:"Sugerida"}; state.rows.push(row); }
    if(!row.desc) row.desc = s.desc;
    row.h[s.day] += s.hours;
    dropSug(s, false);
    toast("Sugestão aceite em "+DAYS[s.day]+".");
  }
  function dropSug(s, notify){
    state.sugs = state.sugs.filter(function(x){ return x.id !== s.id; });
    render();
    if(notify) toast("Sugestão dispensada. O padrão deixa de ser proposto.", "Desfazer", function(){ state.sugs.push(s); render(); });
  }

  /* ---------- render: messages, KPIs ---------- */
  function renderMsgs(){
    var list = validate();
    var box = $("msgs");
    box.innerHTML = "";
    $("msgPanel").hidden = list.length === 0;
    $("msgCount").textContent = list.length + (list.length === 1 ? " mensagem" : " mensagens");
    var names = {e:"ERRO", w:"AVISO", i:"INFO"};
    list.forEach(function(m){
      var row = el("div","msg "+m.sev,"");
      row.appendChild(el("span","ic", names[m.sev]));
      var t = el("span","", m.txt);
      row.appendChild(t);
      if(typeof m.conflict === "number" && !state.submitted){
        var fix = btn("resolver, mover as horas","", (function(day){ return function(){ resolveConflict(day); }; })(m.conflict));
        fix.style.marginLeft = "auto";
        row.appendChild(fix);
      } else if(typeof m.day === "number" && !state.submitted){
        var go = btn("ir para o dia","", function(){
          var r0 = state.rows[0];
          if(r0){ var c = document.getElementById("c-"+r0.id+"-"+m.day); if(c) c.focus(); }
        });
        go.style.marginLeft = "auto";
        row.appendChild(go);
      }
      box.appendChild(row);
    });
  }
  function renderKpis(){
    var tot = weekTotal(), proj = projTotal(), expect = weekCapacity();
    $("kTot").innerHTML = fmt(tot) + "<small> / " + fmt(expect) + " h</small>";
    var pct = expect ? Math.min(100, tot/expect*100) : 0;
    var bar = $("kBar");
    bar.style.width = pct + "%";
    bar.className = tot >= expect ? "ok" : (pct < 80 ? "low" : "");
    var absW = 0;
    for(var a=0; a<5; a++) absW += absHours(a);
    $("kAbs").innerHTML = fmt(absW) + "<small> h descontadas</small>";
    $("kProj").innerHTML = fmt(proj) + "<small> h</small>";
    $("kProjBar").style.width = (tot ? proj/tot*100 : 0) + "%";
    var zeros = 0;
    for(var i=0; i<5; i++) if(capacity(i) > 0 && dayTotal(i) === 0) zeros++;
    $("kZero").textContent = zeros;
    var errs = errors().length;
    $("kVal").textContent = errs ? (errs + (errs===1 ? " erro" : " erros")) : "Sem erros";
    $("kVal").style.color = errs ? "var(--crit)" : "var(--good)";
    $("submitBtn").disabled = state.submitted || errs > 0 || tot === 0;
    $("submitBtn").textContent = state.submitted ? "Semana submetida" : "Submeter semana";
    var chip = $("stateChip");
    chip.textContent = state.submitted ? "Em aprovação" : "Rascunho";
    chip.className = state.submitted ? "chip blue" : "chip grey";
    var sc = $("sugChip"), nv = visibleSugs().length;
    sc.hidden = state.privateMode || nv === 0;
    sc.textContent = nv + (nv === 1 ? " sugestão por rever" : " sugestões por rever");
  }

  function render(){ renderGrid(); renderCal(); renderSugs(); renderAbs(); renderMsgs(); renderKpis(); renderApprovals(); renderCats(); }

  /* ---------- ausências ---------- */
  function renderAbs(){
    var box = $("absList");
    if(!box) return;
    box.innerHTML = "";
    if(!ABSENCES.length){
      box.appendChild(el("div","paused","Sem ausências nesta semana."));
      return;
    }
    ABSENCES.forEach(function(a){
      var c = el("div","abscard" + (a.status === "pending" ? " pend" : ""), "");
      var h = el("div","h","");
      h.appendChild(el("b","", a.type));
      h.appendChild(el("span","chip " + (a.status === "approved" ? "grey" : "amber"), ABSTATUS[a.status]));
      c.appendChild(h);
      c.appendChild(el("div","why", DAYS[a.day] + " · " + fmt(a.hours) + " h · AWART " + a.awart));
      c.appendChild(el("div","why", a.src + " · Leave Request, leitura apenas"));
      if(a.status === "pending"){
        var acts = el("div","acts","");
        acts.appendChild(btn("Simular aprovação","btn sm", function(){ approveAbsence(a); }));
        c.appendChild(acts);
      }
      box.appendChild(c);
    });
  }
  function approveAbsence(a){
    a.status = "approved";
    var moved = dayTotal(a.day);
    render();
    if(moved > 0) toast("Ausência aprovada em "+DAYS[a.day]+". As "+fmt(moved)+" h registadas nesse dia ficaram em conflito.", "Resolver", function(){ resolveConflict(a.day); });
    else toast("Ausência aprovada em "+DAYS[a.day]+". O dia deixou de estar disponível para registo.");
  }
  function resolveConflict(day){
    var target = -1;
    for(var i=0; i<5; i++){ if(capacity(i) - dayTotal(i) > 0){ target = i; break; } }
    var moved = 0;
    state.rows.forEach(function(r){
      if(!r.h[day]) return;
      moved += r.h[day];
      if(target > -1) r.h[target] += r.h[day];
      r.h[day] = 0;
    });
    render();
    toast(target > -1
      ? fmt(moved)+" h movidas de "+DAYS[day]+" para "+DAYS[target]+"."
      : fmt(moved)+" h removidas de "+DAYS[day]+", não havia dia com capacidade livre.");
  }

  /* ---------- CATS mapping screen ---------- */
  var MAP = [
    ["Colaborador do registo","Número de pessoa","PERNR","cats",""],
    ["Coluna do dia na grelha","Data do trabalho","WORKDATE","cats","Uma entrada por dia, nunca agregada à semana"],
    ["Valor da célula","Horas registadas","CATSHOURS","cats","Unidade em UNIT, normalmente H"],
    ["Início e fim, quando exigidos","Janela horária","BEGUZ, ENDUZ","cats","Só quando o país ou o cliente os exigem"],
    ["Projeto e WBS da linha","Elemento PEP recetor","RPROJ","cats","Campo com conversão, a interface mostra a máscara externa"],
    ["Ordem, quando o recetor é ordem","Ordem recetora","RAUFNR","cats","Manutenção, CAPEX ou ordens internas"],
    ["Rede e operação","Rede e operação","RNPLNR, RAUFPL, RAPLZL","cats","Só com planeamento por rede"],
    ["Tipo de atividade","Tipo de atividade CO","LSTAR","cats","Chave da valorização"],
    ["Centro de custo do colaborador","Centro de custo emissor","SKOSTL","cats","Dos dados mestre, nunca manual"],
    ["Centro de custo recetor","Centro de custo recetor","RKOSTL","cats","Entradas internas sem projeto"],
    ["Descrição da entrada","Texto breve","LTXA1","cats","40 caracteres. A interface aceita 300 e trunca"],
    ["Ausências no calendário e na grelha","Tipo de ausência ou presença","AWART","cats","Lidas do Leave Request, leitura apenas. O registo fica no Time Management"],
    ["Bloqueio do dia por ausência","Capacidade diária do colaborador","plano de trabalho e infotipo 2001","cats","Dia inteiro aprovado fecha o dia, meio dia reduz a capacidade"],
    ["Pedido de ausência pendente","Pedido em aprovação","workflow do Leave Request","cats","Não bloqueia, gera aviso. Se for aprovado, as horas do dia entram em conflito"],
    ["Entradas criadas pelo assistente","Sem equivalente","ZZORIGIN com valor Joule","btp","Mesmas validações das entradas manuais, marcadas para auditoria"],
    ["Estado da semana","Estado de processamento","STATUS","cats","Confirmar os valores do domínio no cliente"],
    ["Aprovador e data","Aprovação","APNAM, APDAT","cats","Preenchidos pelo processo, nunca pela interface"],
    ["Correção após submissão","Referência ao registo alterado","REFCOUNTER","cats","A alteração cria novo registo, o histórico fica"],
    ["Origem da entrada","Sem equivalente","ZZORIGIN","btp","Manual, sugerida, copiada, em nome de. Serve telemetria"],
    ["Nível de confiança da sugestão","Sem equivalente","nenhum","btp","Nunca sai da camada de experiência"],
    ["Linha temporal dos sinais","Sem equivalente","nenhum","btp","Retenção de 14 dias, dado pessoal"],
    ["Favoritos e copiar semana","Worklist do CATS","tabelas de worklist","cats","Preferir a worklist standard à lista paralela"],
    ["Justificação do desvio","Sem equivalente","nenhum","btp","Fica no histórico, visível ao aprovador"]
  ];
  var WHERE = {cats:["CATS","cats"], btp:["BTP","btp"], ci:["CI_CATSDB","ci"]};

  function renderMap(){
    var b = $("mapBody");
    if(!b || b.childElementCount) return;
    MAP.forEach(function(m){
      var tr = document.createElement("tr");
      tr.appendChild(td2(m[0]));
      var c2 = document.createElement("td");
      c2.innerHTML = m[1] + (m[4] ? "<div class='sub' style='color:var(--ink-3); font-size:12px'>"+m[4]+"</div>" : "");
      tr.appendChild(c2);
      var c3 = document.createElement("td");
      c3.className = "f" + (m[2] === "nenhum" ? " none" : "");
      c3.textContent = m[2];
      tr.appendChild(c3);
      var c4 = document.createElement("td");
      c4.innerHTML = "<span class='tag "+WHERE[m[3]][1]+"'>"+WHERE[m[3]][0]+"</span>";
      tr.appendChild(c4);
      b.appendChild(tr);
    });
  }

  function catsRecords(){
    var recs = [];
    var status = state.submitted ? "20" : "10";
    state.rows.forEach(function(r){
      var pr = PROJECTS[r.p];
      r.h.forEach(function(v,i){
        if(!v) return;
        recs.push({
          PERNR: PERNR,
          WORKDATE: WORKDATES[i],
          CATSHOURS: fmt(v).replace(",", "."),
          UNIT: "H",
          LSTAR: pr.sap.lstar,
          RPROJ: pr.sap.rproj || "",
          SKOSTL: pr.sap.skostl,
          RKOSTL: pr.sap.rkostl || "",
          LTXA1: (r.desc || pr.act).slice(0,40),
          STATUS: status
        });
      });
    });
    return recs;
  }

  function renderCats(){
    renderMap();
    var body = $("catsBody");
    if(!body) return;
    var recs = catsRecords();
    body.innerHTML = "";
    recs.forEach(function(rec){
      var tr = document.createElement("tr");
      ["PERNR","WORKDATE","CATSHOURS","UNIT","LSTAR","RPROJ","SKOSTL","RKOSTL","LTXA1","STATUS"].forEach(function(k){
        var td = td2(rec[k] || "–");
        if(k !== "LTXA1") td.className = "f";
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    if(!recs.length){
      var tr = document.createElement("tr");
      var td = document.createElement("td");
      td.colSpan = 10; td.style.color = "var(--ink-3)";
      td.textContent = "Sem horas na semana, por isso não há registos a gerar.";
      tr.appendChild(td); body.appendChild(tr);
    }
    $("catsCount").textContent = recs.length + (recs.length === 1 ? " registo gerado" : " registos gerados");
    $("catsPayload").textContent =
      "// Cenário cloud: WorkforceTimesheetService, entidade TimeSheetEntry\n" +
      "// Cenário on premise: BAPI_CATIMESHEETMGR_INSERT, tabela CATSRECORDS\n" +
      "// Nomes das propriedades a confirmar nos metadados do serviço do cliente\n\n" +
      JSON.stringify({
        requestId: "ts-2026-W38-" + PERNR,
        profile: "CONS_PT",
        release: state.submitted,
        records: recs,
        btpOnly: {
          comment: "fica na camada de experiência, não entra em CATSDB",
          origins: state.rows.filter(function(r){ return rowTotal(r) > 0; }).map(function(r){
            return {rproj: PROJECTS[r.p].sap.rproj || PROJECTS[r.p].sap.rkostl, origin: r.origin};
          }),
          absenceCapacity: (function(){
            var o = {};
            for(var i=0; i<5; i++) o[WORKDATES[i]] = fmt(capacity(i)) + " h";
            return o;
          })()
        }
      }, null, 2);
  }


  /* ---------- actions ---------- */
  function addRow(){
    var used = state.rows.map(function(r){ return r.p; });
    var p = 0;
    for(var i=0; i<PROJECTS.length; i++){ if(used.indexOf(i) === -1){ p = i; break; } }
    state.rows.push({id:nextId++, p:p, desc:"", h:[0,0,0,0,0,0,0], origin:"Manual"});
    render();
    var last = state.rows[state.rows.length-1];
    var c = document.getElementById("c-"+last.id+"-0");
    if(c) c.focus();
  }
  function copyWeek(){
    if(state.submitted) return;
    var base = [
      {p:0, desc:"Workshop de requisitos, folha de vencimento"},
      {p:1, desc:"Desenho da solução de registo de tempo"},
      {p:2, desc:"Acompanhamento do rollout"},
      {p:3, desc:"Pré venda e formação interna"}
    ];
    var added = 0;
    base.forEach(function(b){
      if(state.rows.some(function(r){ return r.p === b.p; })) return;
      state.rows.push({id:nextId++, p:b.p, desc:b.desc, h:[0,0,0,0,0,0,0], origin:"Copiada"});
      added++;
    });
    render();
    var first = state.rows[0];
    if(first){ var c = document.getElementById("c-"+first.id+"-0"); if(c) c.focus(); }
    toast(added ? ("Estrutura da semana anterior copiada, sem durações. "+added+" linhas novas.") : "As linhas da semana anterior já estão todas presentes.");
  }
  function applyTemplate(){
    if(state.submitted) return;
    state.rows.forEach(function(r){
      for(var i=0; i<5; i++){ if(!r.h[i]) r.h[i] = PROJECTS[r.p].proj ? 1.5 : 0.5; }
    });
    render();
    toast("Template de alocação aplicado aos dias úteis.", "Desfazer", function(){ location.reload(); });
  }
  function togglePrivate(){
    state.privateMode = !state.privateMode;
    var cap = $("capture");
    cap.classList.toggle("off", state.privateMode);
    $("captureTxt").textContent = state.privateMode ? "Captura em pausa" : "Sugestões ativas, linha temporal privada";
    $("privBtn").textContent = state.privateMode ? "Retomar captura" : "Modo privado";
    render();
  }

  /* ---------- quick add ---------- */
  var nlParsed = null;
  function openQuick(prefill, day){
    var dlg = $("dlgQuick");
    $("nlq").value = prefill || "";
    if(typeof day === "number") $("nlq").dataset.day = day; else delete $("nlq").dataset.day;
    parseNL();
    dlg.showModal();
    setTimeout(function(){ $("nlq").focus(); },30);
  }
  function parseNL(){
    var txt = $("nlq").value;
    var box = $("nlChips");
    box.innerHTML = "";
    if(!txt.trim()){
      box.appendChild(chip("à espera de texto",""));
      nlParsed = null;
      $("nlSave").disabled = true;
      return;
    }
    var rest = txt;
    var dur = NaN, m;
    if((m = rest.match(/(\d+(?:[.,]\d+)?)\s*h/i))){ dur = parseDur(m[1]); rest = rest.replace(m[0]," "); }
    else if((m = rest.match(/(\d{1,2}):(\d{2})/))){ dur = parseDur(m[0]); rest = rest.replace(m[0]," "); }
    else if((m = rest.match(/(\d+)\s*m(?:in)?\b/i))){ dur = parseDur(m[1]+"m"); rest = rest.replace(m[0]," "); }
    else if((m = rest.match(/(^|\s)(\d+(?:[.,]\d+)?)(\s|$)/))){ dur = parseDur(m[2]); rest = rest.replace(m[0]," "); }

    var day = $("nlq").dataset.day ? +$("nlq").dataset.day : 0;
    var dayLabel = null;
    var names = ["segunda","terça","terca","quarta","quinta","sexta"];
    if(/\bontem\b/i.test(rest)){ day = 1; dayLabel = "ontem, "+DAYS[1]; rest = rest.replace(/\bontem\b/i," "); }
    else if(/\bhoje\b/i.test(rest)){ day = 2; dayLabel = "hoje, "+DAYS[2]; rest = rest.replace(/\bhoje\b/i," "); }
    else {
      for(var i=0; i<names.length; i++){
        var re = new RegExp("\\b"+names[i]+"\\b","i");
        if(re.test(rest)){ day = i > 2 ? i-1 : i; dayLabel = DAYS[day]; rest = rest.replace(re," "); break; }
      }
    }
    if(!dayLabel) dayLabel = DAYS[day];

    var pIdx = -1;
    PROJECTS.forEach(function(pr,i){
      var key = pr.code.split("-")[0];
      if(new RegExp("\\b"+key+"\\b","i").test(rest)){ pIdx = i; rest = rest.replace(new RegExp(key+"[\\w-]*","i")," "); }
    });
    var desc = rest.replace(/\s+/g," ").trim();

    box.appendChild(chip(isNaN(dur) || !dur ? "duração por indicar" : fmt(dur)+" h", isNaN(dur) || !dur ? "warnc" : "okc"));
    box.appendChild(chip(dayLabel, "okc"));
    box.appendChild(chip(pIdx === -1 ? "projeto por escolher" : PROJECTS[pIdx].name, pIdx === -1 ? "warnc" : "okc"));
    box.appendChild(chip(pIdx === -1 ? "atividade por definir" : PROJECTS[pIdx].act, pIdx === -1 ? "" : "okc"));
    if(pIdx !== -1) box.appendChild(chip(PROJECTS[pIdx].sap.rproj ? "PEP "+PROJECTS[pIdx].sap.rproj : "centro de custo "+PROJECTS[pIdx].sap.rkostl, "okc"));
    if(desc) box.appendChild(chip("descrição: "+desc.slice(0,42), "okc"));

    var ok = !isNaN(dur) && dur > 0 && pIdx !== -1;
    nlParsed = ok ? {dur:round15(dur), day:day, p:pIdx, desc:desc} : null;
    $("nlSave").disabled = !ok;
  }
  function saveNL(){
    if(!nlParsed) return;
    if(isBlocked(nlParsed.day)){ toast(DAYS[nlParsed.day]+" tem ausência aprovada, não aceita registo de horas."); return; }
    var row = state.rows.filter(function(r){ return r.p === nlParsed.p; })[0];
    if(!row){ row = {id:nextId++, p:nlParsed.p, desc:nlParsed.desc, h:[0,0,0,0,0,0,0], origin:"Manual"}; state.rows.push(row); }
    if(nlParsed.desc) row.desc = nlParsed.desc;
    row.h[nlParsed.day] += nlParsed.dur;
    render();
    toast(fmt(nlParsed.dur)+" h registadas em "+PROJECTS[nlParsed.p].code+", "+DAYS[nlParsed.day]+".");
  }

  /* ---------- detail ---------- */
  var dtRow = null;
  function openDetail(r){
    dtRow = r;
    var pr = PROJECTS[r.p];
    $("dtTitle").textContent = pr.name;
    $("dtProj").value = pr.code + " · " + pr.wbs;
    $("dtDur").value = fmt(rowTotal(r));
    $("dtDesc").value = r.desc;
    $("dtAct").value = pr.act;
    $("dtOrigin").textContent = r.origin;
    var st = $("dtState");
    st.textContent = state.submitted ? "Em aprovação, leitura" : "Rascunho";
    st.className = state.submitted ? "chip blue" : "chip grey";
    $("dtDesc").readOnly = state.submitted;
    $("dtDur").readOnly = true;
    $("dtSave").disabled = state.submitted;
    $("dlgDetail").showModal();
  }
  function saveDetail(){
    if(dtRow){ dtRow.desc = $("dtDesc").value; render(); toast("Entrada atualizada."); }
    $("dlgDetail").close();
  }

  /* ---------- submit ---------- */
  function openSubmit(){
    var byP = {};
    state.rows.forEach(function(r){
      var t = rowTotal(r);
      if(!t) return;
      var k = PROJECTS[r.p].code;
      if(!byP[k]) byP[k] = {name:PROJECTS[r.p].name, t:0, b:PROJECTS[r.p].proj, wbs:PROJECTS[r.p].sap.rproj || PROJECTS[r.p].sap.rkostl};
      byP[k].t += t;
    });
    var body = $("subBody");
    body.innerHTML = "";
    var sum = el("div","sum","");
    Object.keys(byP).forEach(function(k){
      var o = byP[k];
      var r = el("div","r","");
      r.appendChild(el("span","", o.name));
      r.appendChild(el("span","chip "+(o.b?"blue":"grey"), o.wbs));
      r.appendChild(el("span","n", fmt(o.t)+" h"));
      sum.appendChild(r);
    });
    var tr = el("div","r t","");
    tr.appendChild(el("span","","Total da semana"));
    tr.appendChild(el("span","", fmt(projTotal())+" h em projeto"));
    tr.appendChild(el("span","n", fmt(weekTotal())+" h"));
    sum.appendChild(tr);
    body.appendChild(sum);

    var warns = validate().filter(function(m){ return m.sev === "w"; });
    if(warns.length){
      var w = el("div","","");
      w.innerHTML = "<div class='field'><label>"+warns.length+" avisos, não bloqueiam a submissão</label></div>";
      var ul = el("div","sum","");
      warns.forEach(function(m){
        var r = el("div","r","");
        r.appendChild(el("span","", m.txt));
        r.appendChild(el("span","chip amber","aviso"));
        r.appendChild(el("span","",""));
        ul.appendChild(r);
      });
      w.appendChild(ul);
      body.appendChild(w);
      var f = el("div","field","");
      f.innerHTML = "<label for='subWhy'>Justificação do desvio ao esperado</label><textarea id='subWhy' placeholder='Uma linha basta. Fica no histórico da semana.'></textarea>";
      body.appendChild(f);
    }
    $("dlgSubmit").showModal();
  }
  function doSubmit(){
    state.submitted = true;
    $("dlgSubmit").close();
    render();
    toast("Semana 38 submetida para aprovação.", "Reabrir", function(){ state.submitted = false; render(); });
  }

  /* ---------- approvals ---------- */
  function renderApprovals(){
    var body = $("apBody");
    if(!body) return;
    body.innerHTML = "";
    var clean = state.approvals.filter(function(a){ return !a.warn; });
    var flagged = state.approvals.filter(function(a){ return a.warn; });

    function group(title, list, cls){
      if(!list.length) return;
      var gh = document.createElement("tr");
      gh.className = "grouphead";
      var td = document.createElement("td");
      td.colSpan = 7; td.textContent = title;
      gh.appendChild(td); body.appendChild(gh);
      list.forEach(function(a){
        var tr = document.createElement("tr");
        var c1 = document.createElement("td");
        var cb = document.createElement("input");
        cb.type = "checkbox"; cb.checked = a.sel; cb.disabled = !!a.warn;
        cb.setAttribute("aria-label","Selecionar timesheet de "+a.who);
        cb.onchange = function(){ a.sel = cb.checked; renderApprovals(); };
        c1.appendChild(cb); tr.appendChild(c1);
        var c2 = document.createElement("td");
        c2.innerHTML = "<div class='who'>"+a.who+"</div><div class='sub'>"+a.role+"</div>";
        tr.appendChild(c2);
        tr.appendChild(td2(a.proj, "num"));
        tr.appendChild(td2(fmt(a.tot)+" h","n"));
        tr.appendChild(td2(fmt(a.inproj)+" h","n"));
        tr.appendChild(td2((a.dev>0?"+":"")+fmt(a.dev)+" h","n"));
        var c7 = document.createElement("td");
        c7.innerHTML = a.warn
          ? "<span class='chip amber'>"+a.note+"</span>"
          : (a.approved ? "<span class='chip green'>Aprovada</span>" : "<span class='chip blue'>Em aprovação</span>");
        tr.appendChild(c7);
        body.appendChild(tr);
      });
    }
    group("Sem avisos, aprovação em massa disponível", clean);
    group("Exceções, exigem revisão individual", flagged);

    var sel = state.approvals.filter(function(a){ return a.sel; }).length;
    $("apSel").textContent = sel + (sel === 1 ? " selecionada" : " selecionadas");
    $("apApprove").disabled = sel === 0;
    var pend = state.approvals.filter(function(a){ return !a.approved; }).length;
    $("apPend").textContent = pend;
    $("apWarn").textContent = flagged.filter(function(a){ return !a.approved; }).length;
  }
  function td2(txt, cls){ var td = document.createElement("td"); td.className = cls || ""; td.textContent = txt; return td; }

  /* ---------- helpers ---------- */
  function el(tag, cls, txt){ var n = document.createElement(tag); if(cls) n.className = cls; if(txt) n.textContent = txt; return n; }
  function btn(txt, cls, fn){ var b = document.createElement("button"); b.className = cls || "btn"; b.textContent = txt; if(fn) b.onclick = fn; return b; }
  function chip(txt, cls){ var s = document.createElement("span"); s.className = "pchip " + (cls||""); s.textContent = txt; return s; }
  function toast(txt, actionLabel, fn){
    var box = $("toasts");
    var t = el("div","toast","");
    t.appendChild(el("span","", txt));
    if(actionLabel){ t.appendChild(btn(actionLabel,"", function(){ fn(); box.removeChild(t); })); }
    box.appendChild(t);
    setTimeout(function(){ if(t.parentNode) box.removeChild(t); }, 8000);
  }

  /* ---------- wiring ---------- */
  $("addRow").onclick = addRow;
  $("copyWeek").onclick = copyWeek;
  $("tplBtn").onclick = applyTemplate;
  $("quickBtn").onclick = function(){ openQuick("", 2); };
  $("submitBtn").onclick = openSubmit;
  $("privBtn").onclick = togglePrivate;
  $("sugChip").onclick = function(){ $("sugPanel").scrollIntoView({block:"center"}); };
  $("acceptHi").onclick = function(){
    var hi = visibleSugs().filter(function(s){ return s.conf === "hi"; });
    if(!hi.length) return;
    hi.forEach(acceptSug);
    toast(hi.length+" sugestões de confiança alta aplicadas. As de confiança média e baixa ficam por rever.");
  };
  $("vGrid").onclick = function(){ setView(true); };
  $("vCal").onclick = function(){ setView(false); };
  function setView(grid){
    $("viewGrid").hidden = !grid; $("viewCal").hidden = grid;
    $("vGrid").setAttribute("aria-pressed", grid ? "true" : "false");
    $("vCal").setAttribute("aria-pressed", grid ? "false" : "true");
  }
  $("nlq").addEventListener("input", parseNL);
  $("nlSave").onclick = function(){ saveNL(); };
  $("dtSave").onclick = saveDetail;
  $("dtCancel").onclick = function(){ $("dlgDetail").close(); };
  $("subCancel").onclick = function(){ $("dlgSubmit").close(); };
  $("subOk").onclick = doSubmit;
  $("dataBtn").onclick = function(){ $("dlgData").showModal(); };
  $("dataClose").onclick = function(){ $("dlgData").close(); };
  $("dataWipe").onclick = function(){ $("dlgData").close(); state.sugs = []; render(); toast("Linha temporal bruta eliminada. As sugestões pendentes desapareceram com ela."); };
  $("helpBtn").onclick = function(){ $("dlgHelp").showModal(); };
  $("helpClose").onclick = function(){ $("dlgHelp").close(); };
  $("prevW").onclick = function(){ toast("Navegação de semana simulada neste protótipo."); };
  $("nextW").onclick = function(){ toast("Navegação de semana simulada neste protótipo."); };

  $("fTbl").onclick = function(){ setFmt(true); };
  $("fPay").onclick = function(){ setFmt(false); };
  function setFmt(tbl){
    $("catsTable").hidden = !tbl; $("catsPayload").hidden = tbl;
    $("fTbl").setAttribute("aria-pressed", tbl ? "true" : "false");
    $("fPay").setAttribute("aria-pressed", tbl ? "false" : "true");
  }

  $("apAll").onchange = function(){
    var on = $("apAll").checked;
    state.approvals.forEach(function(a){ if(!a.warn) a.sel = on; });
    renderApprovals();
  };
  $("apSelClean").onclick = function(){
    state.approvals.forEach(function(a){ if(!a.warn) a.sel = true; });
    renderApprovals();
  };
  $("apApprove").onclick = function(){
    var n = 0;
    state.approvals.forEach(function(a){ if(a.sel){ a.approved = true; a.sel = false; n++; } });
    renderApprovals();
    toast(n+" timesheets aprovadas numa só chamada. As exceções continuam por revisão.");
  };

  Array.prototype.forEach.call(document.querySelectorAll(".nav button"), function(b){
    b.onclick = function(){
      var s = b.dataset.screen;
      Array.prototype.forEach.call(document.querySelectorAll(".nav button"), function(x){ x.setAttribute("aria-current", x === b ? "true" : "false"); });
      ["semana","aprov","cats"].forEach(function(k){ $("screen-"+k).hidden = k !== s; });
      if(s === "cats") renderCats();
      window.scrollTo({top:0});
    };
  });

  /* ---------- assistente conversacional, padrão Joule ---------- */
  var chat = {pending:null, greeted:false};

  function botToggle(force){
    var p = $("joulePanel");
    var open = typeof force === "boolean" ? force : p.hidden;
    p.hidden = !open;
    $("jouleFab").setAttribute("aria-expanded", open ? "true" : "false");
    if(open){
      if(!chat.greeted){
        chat.greeted = true;
        botSay("bot", "Olá Tiago. Posso registar horas, mostrar o estado da semana, ver as suas ausências ou submeter a folha. Diga o que fez, em linguagem normal.");
        botChips(["Quantas horas tenho?","As minhas ausências","2h BNK testes ontem","Submeter a semana"]);
      }
      setTimeout(function(){ $("jinput").focus(); }, 60);
    }
  }
  function botSay(who, txt, node){
    var log = $("jlog");
    var b = el("div","jmsg "+who,"");
    if(txt){
      var t = el("div","jtxt","");
      if(who === "bot") t.innerHTML = txt; else t.textContent = txt;
      b.appendChild(t);
    }
    if(node) b.appendChild(node);
    log.appendChild(b);
    log.scrollTop = log.scrollHeight;
    return b;
  }
  function botChips(list){
    var box = $("jchips");
    box.innerHTML = "";
    (list || []).forEach(function(t){
      box.appendChild(btn(t,"btn sm", function(){ botHandle(t); }));
    });
  }
  function botCard(lines, confirmLabel, onConfirm, warn){
    var c = el("div","jcard" + (warn ? " warn" : ""), "");
    lines.forEach(function(l){
      var r = el("div","jrow","");
      r.appendChild(el("span","k", l[0]));
      r.appendChild(el("span","v", l[1]));
      c.appendChild(r);
    });
    if(warn) c.appendChild(el("div","jwarn", warn));
    var acts = el("div","acts","");
    acts.appendChild(btn(confirmLabel,"btn sm primary", function(){
      chat.pending = null;
      acts.innerHTML = "";
      acts.appendChild(el("span","chip green","confirmado"));
      onConfirm();
    }));
    acts.appendChild(btn("Cancelar","btn sm", function(){
      chat.pending = null;
      acts.innerHTML = "";
      acts.appendChild(el("span","chip grey","cancelado"));
      botSay("bot","Sem problema, não gravei nada.");
    }));
    c.appendChild(acts);
    return c;
  }
  function nextFreeDay(from){
    for(var i=0; i<5; i++){ if(capacity(i) - dayTotal(i) > 0) return i; }
    return -1;
  }
  function weekSummaryText(){
    var errs = errors().length;
    return "Tem " + fmt(weekTotal()) + " h registadas de " + fmt(weekCapacity()) +
      " h esperadas, já com as ausências descontadas. " +
      (errs ? errs + (errs === 1 ? " erro impede a submissão." : " erros impedem a submissão.") : "Sem erros, pode submeter.");
  }

  /* ações do assistente, partilhadas entre o Claude (via /api/chat) e o interpretador local */
  function showAbsences(){
    var node = el("div","jlist","");
    ABSENCES.forEach(function(a){
      node.appendChild(el("div","jrow2", DAYS[a.day] + " · " + a.type + " · " + fmt(a.hours) + " h · " + ABSTATUS[a.status]));
    });
    botSay("bot","Estas são as ausências da semana, vindas do Leave Request. Os dias de ausência aprovada de dia inteiro não aceitam registo de horas.", node);
    botChips(["Quantas horas tenho?","Copiar a semana passada"]);
  }
  function showWeekStatus(){
    botSay("bot", weekSummaryText());
    botChips(["As minhas ausências","Submeter a semana"]);
  }
  function showSuggestionsPanel(){
    var vis = visibleSugs();
    botSay("bot", vis.length
      ? "Tem " + vis.length + " sugestões por rever no painel lateral. Posso aplicar as de confiança alta, se quiser."
      : "Não há sugestões por rever.");
    if(vis.length) botChips(["Aplicar as de confiança alta"]);
  }
  function offerApplyHighConfidence(){
    var hi = visibleSugs().filter(function(s){ return s.conf === "hi"; });
    if(!hi.length){ botSay("bot","Não tenho sugestões de confiança alta pendentes."); return; }
    chat.pending = "sugs";
    botSay("bot","Confirma a aplicação destas sugestões?", botCard(
      hi.map(function(s){ return [DAYS[s.day] + ", " + PROJECTS[s.p].code, fmt(s.hours) + " h"]; }),
      "Aplicar", function(){
        hi.forEach(acceptSug);
        botSay("bot", hi.length + " sugestões aplicadas. " + weekSummaryText());
      }));
  }
  function offerCopyWeek(){
    chat.pending = "copy";
    botSay("bot","Posso trazer a estrutura da semana anterior, sem durações.", botCard(
      [["Ação","copiar linhas da semana anterior"],["Durações","ficam a zero"]],
      "Copiar", function(){ copyWeek(); botSay("bot","Feito. As linhas estão criadas, falta preencher as durações."); }));
  }
  function offerSubmit(){
    if(state.submitted){ botSay("bot","A semana já está submetida e em aprovação."); return; }
    var errs = errors();
    if(errs.length){
      botSay("bot","Ainda não posso submeter. " + errs[0].txt);
      botChips(["Quantas horas tenho?"]);
      return;
    }
    chat.pending = "submit";
    botSay("bot","Confirma a submissão da semana 38?", botCard(
      [["Total","" + fmt(weekTotal()) + " h"],["Esperado","" + fmt(weekCapacity()) + " h"],["Estado após submeter","Em aprovação"]],
      "Submeter", function(){ doSubmit(); botSay("bot","Semana submetida. Fica em aprovação com o gestor de projeto."); }));
  }
  function offerEntry(day, dur, pIdx, desc){
    var pr = PROJECTS[pIdx];
    var alt = null;
    if(isBlocked(day)){
      alt = nextFreeDay();
      if(alt === -1){
        botSay("bot", DAYS[day] + " tem " + absOn(day,"approved")[0].type.toLowerCase() + " aprovada e não há outro dia com capacidade livre. Não registei nada.");
        return;
      }
      botSay("bot", DAYS[day] + " tem " + absOn(day,"approved")[0].type.toLowerCase() + " aprovada, por isso não aceita horas. Proponho " + DAYS[alt] + ".");
      day = alt;
    }
    var livre = capacity(day) - dayTotal(day);
    var warn = null;
    if(dur > livre){
      warn = "Este registo deixa o dia com " + fmt(dayTotal(day) + dur) + " h, acima da capacidade de " + fmt(capacity(day)) + " h. Vai gerar erro na submissão.";
    }
    chat.pending = "entry";
    botSay("bot","Confirma esta entrada?", botCard([
      ["Dia", DAYS[day]],
      ["Duração", fmt(dur) + " h"],
      ["Projeto", pr.name],
      ["Objeto recetor", pr.sap.rproj ? "PEP " + pr.sap.rproj : "Centro de custo " + pr.sap.rkostl],
      ["Tipo de atividade", pr.sap.lstar + ", " + pr.act],
      ["Descrição", desc || "(por preencher)"],
      ["Origem", "Joule"]
    ], "Gravar", function(){
      var row = state.rows.filter(function(r){ return r.p === pIdx; })[0];
      if(!row){ row = {id:nextId++, p:pIdx, desc:desc, h:[0,0,0,0,0,0,0], origin:"Joule"}; state.rows.push(row); }
      if(desc) row.desc = desc;
      row.origin = "Joule";
      row.h[day] += dur;
      render();
      botSay("bot", fmt(dur) + " h gravadas em " + DAYS[day] + ", " + pr.code + ". " + weekSummaryText());
      botChips(["Submeter a semana","As minhas ausências"]);
    }, warn));
  }

  /* pede ao Claude, em /api/chat, para interpretar o texto e escolher uma função.
     Devolve null em qualquer falha (sem chave configurada, rede, erro do motor),
     e nesse caso o chamador cai no interpretador local por regex. */
  async function askAssistant(txt){
    try{
      var res = await fetch("/api/chat", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          mensagem: txt,
          contexto: {
            projetos: PROJECTS.map(function(p,i){ return {codigo: p.code.split("-")[0], nome: p.name, indice: i}; }),
            ausencias: ABSENCES.map(function(a){ return {dia: DAYS[a.day], indice: a.day, tipo: a.type, horas: a.hours, estado: a.status}; }),
            capacidades: [0,1,2,3,4].map(function(d){ return {dia: DAYS[d], indice: d, capacidade: capacity(d), registado: dayTotal(d)}; }),
            semana: {total: weekTotal(), esperado: weekCapacity(), erros: errors().length, submetida: state.submitted}
          }
        })
      });
      if(!res.ok) return null;
      var data = await res.json();
      if(!data || data.error) return null;
      return data;
    }catch(e){
      return null;
    }
  }

  /* mapeia a resposta do Claude (função + argumentos) para as mesmas ações do bot */
  function botDispatch(intent){
    switch(intent.funcao){
      case "listar_ausencias": showAbsences(); return true;
      case "consultar_semana": showWeekStatus(); return true;
      case "aplicar_sugestoes": offerApplyHighConfidence(); return true;
      case "copiar_semana": offerCopyWeek(); return true;
      case "submeter_semana": offerSubmit(); return true;
      case "registar_horas":
        var a = intent.argumentos || {};
        var dayIdx = WORKDATES.indexOf(String(a.dia || "").replace(/-/g,""));
        var pIdx = -1;
        PROJECTS.forEach(function(pr,i){
          if(pr.code.toLowerCase().indexOf(String(a.projeto || "").toLowerCase()) === 0) pIdx = i;
        });
        var dur = round15(Number(a.duracao_horas));
        if(dayIdx === -1 || dayIdx > 4 || pIdx === -1 || !dur || dur <= 0){
          botSay("bot", intent.texto || "Não consegui confirmar todos os dados desse registo. Pode escrever de outra forma?");
          botChips(["Quantas horas tenho?","As minhas ausências"]);
          return true;
        }
        offerEntry(dayIdx, dur, pIdx, a.descricao || "");
        return true;
      default:
        if(intent.texto){
          botSay("bot", intent.texto);
          botChips(["Quantas horas tenho?","As minhas ausências","Ajuda"]);
          return true;
        }
        return false;
    }
  }

  async function botHandle(txt){
    if(!txt || !txt.trim()) return;
    botSay("me", txt);
    botChips([]);

    var intent = await askAssistant(txt);
    if(intent && botDispatch(intent)) return;

    botHandleLocal(txt);
  }

  /* interpretador local por regex, usado quando o Claude não está configurado ou falha */
  function botHandleLocal(txt){
    var t = txt.toLowerCase();

    /* ausências */
    if(/ausênc|ausenc|férias|ferias|leave|falta/.test(t)){ showAbsences(); return; }
    /* estado da semana */
    if(/quantas horas|estado|resumo|como está|como esta|falta/.test(t)){ showWeekStatus(); return; }
    /* sugestões */
    if(/sugest/.test(t) && !/aplicar as de confian/.test(t)){ showSuggestionsPanel(); return; }
    if(/aplicar as de confian/.test(t)){ offerApplyHighConfidence(); return; }
    /* copiar semana */
    if(/copiar|semana passada|semana anterior/.test(t)){ offerCopyWeek(); return; }
    /* submeter */
    if(/submeter|enviar a semana|fechar a semana/.test(t)){ offerSubmit(); return; }

    /* registo de horas, reutiliza o mesmo parser do registo rápido */
    var p = botParse(txt);
    if(!p){
      botSay("bot","Não consegui perceber o que registar. Escreva a duração e o projeto, por exemplo <span class=\"num\">2h BNK testes de folha ontem</span>. Também posso mostrar o estado da semana ou as ausências.");
      botChips(["Quantas horas tenho?","As minhas ausências","Ajuda"]);
      return;
    }
    offerEntry(p.day, p.dur, p.p, p.desc);
  }

  /* parser do assistente: duração, dia e projeto */
  function botParse(txt){
    var rest = " " + txt + " ", m, dur = NaN;
    if((m = rest.match(/(\d+(?:[.,]\d+)?)\s*h/i))){ dur = parseDur(m[1]); rest = rest.replace(m[0]," "); }
    else if((m = rest.match(/(\d{1,2}):(\d{2})/))){ dur = parseDur(m[0]); rest = rest.replace(m[0]," "); }
    else if((m = rest.match(/(\d+)\s*m(?:in)?\b/i))){ dur = parseDur(m[1]+"m"); rest = rest.replace(m[0]," "); }
    else if((m = rest.match(/\s(\d+(?:[.,]\d+)?)\s/))){ dur = parseDur(m[1]); rest = rest.replace(m[0]," "); }
    if(isNaN(dur) || dur <= 0) return null;

    var day = 2;
    if(/\bontem\b/i.test(rest)){ day = 1; rest = rest.replace(/\bontem\b/i," "); }
    else if(/\bhoje\b/i.test(rest)){ day = 2; rest = rest.replace(/\bhoje\b/i," "); }
    else {
      var names = ["segunda","terça|terca","quarta","quinta","sexta"];
      for(var i=0; i<names.length; i++){
        var re = new RegExp("\\b("+names[i]+")\\b","i");
        if(re.test(rest)){ day = i; rest = rest.replace(re," "); break; }
      }
    }
    var pIdx = -1;
    PROJECTS.forEach(function(pr,i){
      var key = pr.code.split("-")[0];
      if(new RegExp("\\b"+key+"\\b","i").test(rest)){ pIdx = i; rest = rest.replace(new RegExp(key+"[\\w-]*","i")," "); }
    });
    if(pIdx === -1) return null;
    return {dur:round15(dur), day:day, p:pIdx, desc:rest.replace(/\s+/g," ").trim()};
  }

  $("jouleFab").onclick = function(){ botToggle(); };
  $("jClose").onclick = function(){ botToggle(false); };
  $("jform").onsubmit = function(ev){
    ev.preventDefault();
    var v = $("jinput").value;
    $("jinput").value = "";
    botHandle(v);
  };

  document.addEventListener("keydown", function(ev){
    var tag = (ev.target.tagName || "").toLowerCase();
    var typing = tag === "input" || tag === "textarea" || tag === "select";
    if(ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)){ ev.preventDefault(); if(!$("submitBtn").disabled) openSubmit(); return; }
    if(typing) return;
    if(document.querySelector("dialog[open]")) return;
    if(ev.key === "j" || ev.key === "J"){ ev.preventDefault(); botToggle(); }
    else if(ev.key === "n" || ev.key === "N"){ ev.preventDefault(); openQuick("", 2); }
    else if(ev.key === "c" || ev.key === "C"){ ev.preventDefault(); copyWeek(); }
    else if(ev.key === "?"){ ev.preventDefault(); $("dlgHelp").showModal(); }
  });

  render();
})();
