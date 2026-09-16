(function(){
  "use strict";

  var DAYS = [];
  var PROJECTS = [
    {code:"BNK-2026", wbs:"BNK-2026.1.3", name:"Banking, Payroll and ECP", act:"Functional consulting", proj:true,
     sap:{rproj:"BNK-2026.1.3", lstar:"CONS01", skostl:"PT4010", rkostl:"", aufnr:""}},
    {code:"RTL-TT", wbs:"RTL-TT.2.1", name:"Retail, Time Tracking", act:"Functional consulting", proj:true,
     sap:{rproj:"RTL-TT.2.1", lstar:"CONS01", skostl:"PT4010", rkostl:"", aufnr:""}},
    {code:"AER-WFM", wbs:"AER-WFM.4.2", name:"Airports, WFM rollout", act:"Project management", proj:true,
     sap:{rproj:"AER-WFM.4.2", lstar:"PMGT01", skostl:"PT4010", rkostl:"", aufnr:""}},
    {code:"AXI-INT", wbs:"", name:"Internal, pre-sales and training", act:"Administrative", proj:false,
     sap:{rproj:"", lstar:"ADMIN1", skostl:"PT4010", rkostl:"PT4010", aufnr:""}}
  ];
  var PERNR = "00104567";
  var WORKDATES = [];
  var DAYCAP = 8;

  var WEEKDAY_ABBR = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  var MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  function datesFor(startISO){
    var y = +startISO.slice(0,4), m = +startISO.slice(4,6)-1, d = +startISO.slice(6,8);
    var base = new Date(Date.UTC(y,m,d));
    var out = [];
    for(var i=0; i<7; i++){
      var dt = new Date(base.getTime());
      dt.setUTCDate(base.getUTCDate()+i);
      out.push(dt.toISOString().slice(0,10).replace(/-/g,""));
    }
    return out;
  }
  function daysFor(dates){
    return dates.map(function(wd,i){ return WEEKDAY_ABBR[i] + " " + (+wd.slice(6,8)); });
  }
  function weekLabelFor(dates, num){
    var s = dates[0], e = dates[6];
    var sD = +s.slice(6,8), sM = +s.slice(4,6)-1, eD = +e.slice(6,8), eM = +e.slice(4,6)-1, y = s.slice(0,4);
    var range = sM === eM ? (sD+" to "+eD+" "+MONTHS[sM]) : (sD+" "+MONTHS[sM]+" to "+eD+" "+MONTHS[eM]);
    return "Week "+num+", "+range+" "+y;
  }

  /* Absences come from the Leave Request, read-only in this application. Sample data
     covers a few weeks: a posted week, a submitted one, the current draft, and an
     upcoming one, so week navigation has something real to show. */
  var ABSTATUS = {approved:"Approved", pending:"Pending request"};
  var WEEKS = [
    { num:36, start:"20260831", submitted:true,
      absences:[],
      rows:[
        {id:101, p:0, desc:"Payroll cutover testing", h:[4,4,4,4,4,0,0], origin:"Manual"},
        {id:102, p:1, desc:"Time tracking rollout support", h:[4,4,4,4,4,0,0], origin:"Manual"}
      ],
      sugs:[]
    },
    { num:37, start:"20260907", submitted:true,
      absences:[
        {id:"ab37a", day:4, type:"Vacation", awart:"0100", hours:8, status:"approved", src:"Request 4500198"}
      ],
      rows:[
        {id:103, p:0, desc:"Payroll parallel run", h:[4,4,4,4,0,0,0], origin:"Manual"},
        {id:104, p:2, desc:"WFM rollout kickoff", h:[4,4,4,4,0,0,0], origin:"Suggested"}
      ],
      sugs:[]
    },
    { num:38, start:"20260914", submitted:false,
      absences:[
        {id:"ab1", day:2, type:"Medical appointment", awart:"0210", hours:4, status:"approved", src:"Request 4500219"},
        {id:"ab2", day:4, type:"Vacation", awart:"0100", hours:8, status:"approved", src:"Request 4500221"},
        {id:"ab3", day:3, type:"Vacation", awart:"0100", hours:8, status:"pending", src:"Request 4500230"}
      ],
      rows:[
        {id:1, p:0, desc:"Requirements workshop, payroll", h:[3,4,0,2,0,0,0], origin:"Manual"},
        {id:2, p:1, desc:"Time recording solution design", h:[2,0,3,0,0,0,0], origin:"Suggested"},
        {id:3, p:3, desc:"", h:[1,0,0,1.5,0,0,0], origin:"Manual"}
      ],
      sugs:[
        {id:"s1", hours:2.5, day:2, p:2, why:"3 client meetings on the calendar", conf:"hi", desc:"Rollout follow-up meetings"},
        {id:"s2", hours:1.5, day:3, p:1, why:"12 changes in the project repository", conf:"hi", desc:"Time rules configuration"},
        {id:"s3", hours:2, day:4, p:0, why:"4 tickets handled in Cloud ALM", conf:"mid", desc:"Post-testing payroll fixes"},
        {id:"s4", hours:1, day:4, p:3, why:"Block with no attributable signal", conf:"low", desc:""}
      ]
    },
    { num:39, start:"20260921", submitted:false,
      absences:[
        {id:"ab39a", day:0, type:"Vacation", awart:"0100", hours:8, status:"pending", src:"Request 4500255"}
      ],
      rows:[],
      sugs:[
        {id:"s5", hours:2, day:1, p:0, why:"2 client meetings on the calendar", conf:"hi", desc:"Payroll steering follow-up"}
      ]
    }
  ];
  var weekIdx = 2;
  var ABSENCES = WEEKS[weekIdx].absences;
  WORKDATES = datesFor(WEEKS[weekIdx].start);
  DAYS = daysFor(WORKDATES);

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
    submitted: WEEKS[weekIdx].submitted,
    privateMode:false,
    rows: WEEKS[weekIdx].rows,
    sugs: WEEKS[weekIdx].sugs,
    approvals:[
      {who:"Ana Ferreira", role:"Senior consultant", proj:"BNK-2026", tot:40, inproj:36, dev:0, warn:0, sel:false},
      {who:"Bruno Matos", role:"Consultant", proj:"RTL-TT", tot:38.5, inproj:34, dev:-1.5, warn:0, sel:false},
      {who:"Carla Nunes", role:"Consultant", proj:"AER-WFM", tot:40, inproj:40, dev:0, warn:0, sel:false},
      {who:"Diogo Sousa", role:"Junior consultant", proj:"BNK-2026", tot:37, inproj:30, dev:-3, warn:0, sel:false},
      {who:"Eva Lopes", role:"Architect", proj:"RTL-TT", tot:52, inproj:52, dev:12, warn:1, sel:false, note:"12 h above plan"},
      {who:"Filipe Reis", role:"Consultant", proj:"AER-WFM", tot:24, inproj:18, dev:-16, warn:1, sel:false, note:"Two empty working days"}
    ]
  };

  var $ = function(id){ return document.getElementById(id); };
  var nextId = 100;

  function fmt(n){ return (Math.round(n*100)/100).toFixed(1); }
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
      if(dayTotal(d) > 24) out.push({sev:"e", txt:"The total for "+DAYS[d]+" exceeds 24 hours.", day:d});
    }
    state.rows.forEach(function(r){
      if(PROJECTS[r.p].proj && rowTotal(r) > 0 && r.desc.trim().length < 10){
        out.push({sev:"e", txt:"Project entries need a description: "+PROJECTS[r.p].code+".", row:r.id});
      }
    });
    /* conflicts with absences */
    for(var a=0; a<5; a++){
      var cap = capacity(a), tot = dayTotal(a);
      if(tot === 0) continue;
      if(cap === 0){
        out.push({sev:"e", day:a, conflict:a,
          txt:DAYS[a]+" has an approved "+absOn(a,"approved")[0].type.toLowerCase()+". The "+fmt(tot)+" h recorded need to move off this day."});
      } else if(tot > cap){
        out.push({sev:"e", day:a,
          txt:DAYS[a]+" has an approved partial absence. Day capacity is "+fmt(cap)+" h and "+fmt(tot)+" h are recorded."});
      }
    }
    for(var p=0; p<5; p++){
      if(absOn(p,"pending").length && dayTotal(p) > 0){
        out.push({sev:"w", day:p, txt:DAYS[p]+" has a pending leave request and recorded hours. If the request is approved, these hours will conflict."});
      }
    }
    for(var i=0; i<5; i++){
      if(capacity(i) > 0 && dayTotal(i) === 0) out.push({sev:"w", txt:DAYS[i]+" is empty.", day:i});
    }
    var expect = weekCapacity();
    if(weekTotal() > 0 && weekTotal() < expect) out.push({sev:"w", txt:"The week has "+fmt(weekTotal())+" h recorded; the expected total with absences deducted is "+fmt(expect)+" h."});
    var pend = visibleSugs().length;
    if(pend > 0 && !state.privateMode) out.push({sev:"i", txt:pend+" suggestions still to review in the side panel."});
    return out;
  }
  function errors(){ return validate().filter(function(m){ return m.sev === "e"; }); }

  /* ---------- render: grid ---------- */
  function renderGrid(){
    var g = $("tsgrid");
    g.innerHTML = "";

    var head = document.createElement("div");
    head.className = "row head";
    head.appendChild(el("div","","Project, WBS and activity"));
    DAYS.forEach(function(d,i){
      var c = el("div", i>4?"we":"", "");
      c.appendChild(el("span","", d));
      var ap = absOn(i,"approved")[0], pe = absOn(i,"pending")[0];
      if(ap) c.appendChild(el("span","dayabs" + (capacity(i) === 0 ? " full" : ""), capacity(i) === 0 ? ap.type : "half day"));
      else if(pe) c.appendChild(el("span","dayabs pend", "pending"));
      head.appendChild(c);
    });
    head.appendChild(el("div","","Total"));
    head.appendChild(el("div","",""));
    g.appendChild(head);

    if(state.rows.length === 0){
      var e = document.createElement("div");
      e.className = "empty";
      e.innerHTML = '<p><strong>No hours recorded this week yet.</strong> Start with the shortest path.</p>';
      var acts = el("div","acts","");
      acts.appendChild(btn("Copy last week","btn primary", copyWeek));
      acts.appendChild(btn("Review "+state.sugs.length+" suggestions","btn", function(){ $("sugPanel").scrollIntoView({block:"center"}); }));
      acts.appendChild(btn("Add the first project","btn", addRow));
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
      p.appendChild(el("span","bill" + (pr.proj?"":" no"), pr.proj ? "PEP" : "INTERNAL"));
      meta.appendChild(p);
      var needDesc = pr.proj && rowTotal(r) > 0 && r.desc.trim().length < 10;
      var s = el("div","s", (r.desc || (needDesc ? "Description required" : "No description")) + " · " + pr.act);
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
        inp.setAttribute("aria-label","Duration in hours, "+pr.name+", "+DAYS[i]);
        inp.disabled = state.submitted || (isBlocked(i) && !v);
        if(isBlocked(i)){
          inp.classList.add("abs");
          inp.title = "Approved " + absOn(i,"approved")[0].type.toLowerCase() + ", day not available for time entry";
        } else if(absHours(i) > 0){
          inp.title = "Approved partial absence, capacity of " + fmt(capacity(i)) + " h this day";
        }
        inp.addEventListener("change", function(){
          var parsed = parseDur(inp.value);
          if(isNaN(parsed)){ toast("Couldn't read “"+inp.value+"”. Use 1.5 or 1:30 or 90m."); inp.value = v ? fmt(v) : ""; return; }
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
        render(); toast("Row removed.", "Undo", function(){ state.rows.push(r); render(); });
      });
      rm.setAttribute("aria-label","Remove row "+pr.name);
      rm.disabled = state.submitted;
      act.appendChild(rm);
      row.appendChild(act);
      g.appendChild(row);
    });

    if(state.rows.length){
      var tr = document.createElement("div");
      tr.className = "row totals";
      tr.appendChild(el("div","rowmeta","Total per day"));
      for(var d=0; d<7; d++){
        var v = dayTotal(d), cap = capacity(d);
        var cls = "t";
        if(v > 24 || (d < 5 && v > cap)) cls += " over";
        else if(v === 0 && d < 5 && cap > 0) cls += " zero";
        else if(d < 5 && cap === 0) cls += " off";
        tr.appendChild(el("div", cls, d < 5 && cap === 0 && !v ? "–" : (v ? fmt(v) : "0.0")));
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
    cal.appendChild(el("div","ch","Time"));
    for(var i=0; i<7; i++) cal.appendChild(el("div","ch", DAYS[i]));

    var hours = el("div","hours","");
    for(var h=9; h<19; h++){ hours.appendChild(el("span","", h+":00")); }
    cal.appendChild(hours);

    for(var d=0; d<7; d++){
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
        ext.innerHTML = "<b>1.0 h</b>Project committee, external client · convert";
        ext.onclick = (function(day){ return function(){ openQuick("1h AER project committee", day); }; })(d);
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
        free.textContent = "+ log time";
        free.onclick = (function(day){ return function(){ openQuick("", day); }; })(d);
        col.appendChild(free);
      } else {
        col.appendChild(el("div","calfree off","day not available"));
      }
      cal.appendChild(col);
    }
  }

  /* ---------- render: suggestions ---------- */
  var CONF = {hi:"high confidence", mid:"medium confidence", low:"low confidence"};
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
      p.innerHTML = "<strong>Private mode on.</strong><span>Signal capture is paused. Nothing is collected while this mode is on.</span>";
      p.appendChild(btn("Resume suggestions","btn", togglePrivate));
      box.appendChild(p);
      return;
    }
    if(vis.length === 0){
      box.appendChild(el("div","paused", hidden ? "Nothing to propose. The suggestions that existed fell on days with an approved absence." : "No pending suggestions. Good sign, the week is reviewed."));
      return;
    }
    if(hidden){
      box.appendChild(el("div","msg i", hidden + (hidden === 1 ? " suggestion discarded" : " suggestions discarded") + " for falling on days with an approved absence."));
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
      acts.appendChild(btn("Accept","btn sm primary", function(){ acceptSug(s); }));
      acts.appendChild(btn("Edit","btn sm", function(){ openQuick(fmt(s.hours)+"h "+pr.code+" "+(s.desc||""), s.day); }));
      acts.appendChild(btn("Dismiss","btn sm ghost", function(){ dropSug(s, true); }));
      card.appendChild(acts);
      box.appendChild(card);
    });
  }
  function acceptSug(s){
    if(isBlocked(s.day)){ toast(DAYS[s.day]+" has an approved absence, the suggestion can't be applied."); return; }
    var row = state.rows.filter(function(r){ return r.p === s.p; })[0];
    if(!row){ row = {id:nextId++, p:s.p, desc:s.desc, h:[0,0,0,0,0,0,0], origin:"Suggested"}; state.rows.push(row); }
    if(!row.desc) row.desc = s.desc;
    row.h[s.day] += s.hours;
    dropSug(s, false);
    toast("Suggestion accepted on "+DAYS[s.day]+".");
  }
  function dropSug(s, notify){
    state.sugs = state.sugs.filter(function(x){ return x.id !== s.id; });
    render();
    if(notify) toast("Suggestion dismissed. The pattern won't be proposed again.", "Undo", function(){ state.sugs.push(s); render(); });
  }

  /* ---------- render: messages, KPIs ---------- */
  function renderMsgs(){
    var list = validate();
    var box = $("msgs");
    box.innerHTML = "";
    $("msgPanel").hidden = list.length === 0;
    $("msgCount").textContent = list.length + (list.length === 1 ? " message" : " messages");
    var names = {e:"ERROR", w:"WARNING", i:"INFO"};
    list.forEach(function(m){
      var row = el("div","msg "+m.sev,"");
      row.appendChild(el("span","ic", names[m.sev]));
      var t = el("span","", m.txt);
      row.appendChild(t);
      if(typeof m.conflict === "number" && !state.submitted){
        var fix = btn("resolve, move the hours","", (function(day){ return function(){ resolveConflict(day); }; })(m.conflict));
        fix.style.marginLeft = "auto";
        row.appendChild(fix);
      } else if(typeof m.day === "number" && !state.submitted){
        var go = btn("go to day","", function(){
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
    $("weekLabel").textContent = weekLabelFor(WORKDATES, WEEKS[weekIdx].num);
    $("prevW").disabled = weekIdx === 0;
    $("nextW").disabled = weekIdx === WEEKS.length - 1;
    var tot = weekTotal(), proj = projTotal(), expect = weekCapacity();
    $("kTot").innerHTML = fmt(tot) + "<small> / " + fmt(expect) + " h</small>";
    var pct = expect ? Math.min(100, tot/expect*100) : 0;
    var bar = $("kBar");
    bar.style.width = pct + "%";
    bar.className = tot >= expect ? "ok" : (pct < 80 ? "low" : "");
    var absW = 0;
    for(var a=0; a<5; a++) absW += absHours(a);
    $("kAbs").innerHTML = fmt(absW) + "<small> h deducted</small>";
    $("kProj").innerHTML = fmt(proj) + "<small> h</small>";
    $("kProjBar").style.width = (tot ? proj/tot*100 : 0) + "%";
    var zeros = 0;
    for(var i=0; i<5; i++) if(capacity(i) > 0 && dayTotal(i) === 0) zeros++;
    $("kZero").textContent = zeros;
    var errs = errors().length;
    $("kVal").textContent = errs ? (errs + (errs===1 ? " error" : " errors")) : "No errors";
    $("kVal").style.color = errs ? "var(--crit)" : "var(--good)";
    $("submitBtn").disabled = state.submitted || errs > 0 || tot === 0;
    $("submitBtn").textContent = state.submitted ? "Week submitted" : "Submit week";
    var chip = $("stateChip");
    chip.textContent = state.submitted ? "In approval" : "Draft";
    chip.className = state.submitted ? "chip blue" : "chip grey";
    var sc = $("sugChip"), nv = visibleSugs().length;
    sc.hidden = state.privateMode || nv === 0;
    sc.textContent = nv + (nv === 1 ? " suggestion to review" : " suggestions to review");
  }

  function render(){ renderGrid(); renderCal(); renderSugs(); renderAbs(); renderMsgs(); renderKpis(); renderApprovals(); renderCats(); }

  /* ---------- absences ---------- */
  function renderAbs(){
    var box = $("absList");
    if(!box) return;
    box.innerHTML = "";
    if(!ABSENCES.length){
      box.appendChild(el("div","paused","No absences this week."));
      return;
    }
    ABSENCES.forEach(function(a){
      var c = el("div","abscard" + (a.status === "pending" ? " pend" : ""), "");
      var h = el("div","h","");
      h.appendChild(el("b","", a.type));
      h.appendChild(el("span","chip " + (a.status === "approved" ? "grey" : "amber"), ABSTATUS[a.status]));
      c.appendChild(h);
      c.appendChild(el("div","why", DAYS[a.day] + " · " + fmt(a.hours) + " h · AWART " + a.awart));
      c.appendChild(el("div","why", a.src + " · Leave Request, read-only"));
      if(a.status === "pending"){
        var acts = el("div","acts","");
        acts.appendChild(btn("Simulate approval","btn sm", function(){ approveAbsence(a); }));
        c.appendChild(acts);
      }
      box.appendChild(c);
    });
  }
  function approveAbsence(a){
    a.status = "approved";
    var moved = dayTotal(a.day);
    render();
    if(moved > 0) toast("Absence approved on "+DAYS[a.day]+". The "+fmt(moved)+" h recorded that day are now in conflict.", "Resolve", function(){ resolveConflict(a.day); });
    else toast("Absence approved on "+DAYS[a.day]+". The day is no longer available for time entry.");
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
      ? fmt(moved)+" h moved from "+DAYS[day]+" to "+DAYS[target]+"."
      : fmt(moved)+" h removed from "+DAYS[day]+", no day had free capacity.");
  }

  /* ---------- CATS mapping screen ---------- */
  var MAP = [
    ["Employee recording the time","Personnel number","PERNR","cats",""],
    ["Day column in the grid","Work date","WORKDATE","cats","One entry per day, never aggregated to the week"],
    ["Cell value","Recorded hours","CATSHOURS","cats","Unit in UNIT, usually H"],
    ["Start and end, when required","Time window","BEGUZ, ENDUZ","cats","Only when the country or the client requires it"],
    ["Project and WBS of the row","Receiver WBS element","RPROJ","cats","Field with conversion, the interface shows the external mask"],
    ["Order, when the receiver is an order","Receiver order","RAUFNR","cats","Maintenance, CAPEX or internal orders"],
    ["Network and operation","Network and operation","RNPLNR, RAUFPL, RAPLZL","cats","Only with network planning"],
    ["Activity type","CO activity type","LSTAR","cats","The valuation key"],
    ["Employee's cost center","Sender cost center","SKOSTL","cats","From master data, never manual"],
    ["Receiver cost center","Receiver cost center","RKOSTL","cats","Internal entries without a project"],
    ["Entry description","Short text","LTXA1","cats","40 characters. The interface accepts 300 and truncates"],
    ["Absences in the calendar and the grid","Absence or attendance type","AWART","cats","Read from the Leave Request, read-only. The record stays in Time Management"],
    ["Day blocking from an absence","Employee's daily capacity","work schedule and infotype 2001","cats","An approved full day closes the day, a half day reduces capacity"],
    ["Pending leave request","Request in approval","Leave Request workflow","cats","Doesn't block, raises a warning. If approved, that day's hours conflict"],
    ["Entries created by the assistant","No equivalent","ZZORIGIN with value Joule","btp","Same validations as manual entries, flagged for audit"],
    ["Week status","Processing status","STATUS","cats","Confirm the domain values with the client"],
    ["Approver and date","Approval","APNAM, APDAT","cats","Filled by the process, never by the interface"],
    ["Correction after submission","Reference to the changed record","REFCOUNTER","cats","The change creates a new record, history stays"],
    ["Entry origin","No equivalent","ZZORIGIN","btp","Manual, suggested, copied, on behalf of. Used for telemetry"],
    ["Suggestion confidence level","No equivalent","none","btp","Never leaves the experience layer"],
    ["Signal timeline","No equivalent","none","btp","14-day retention, personal data"],
    ["Favorites and copy week","CATS worklist","worklist tables","cats","Prefer the standard worklist over a parallel list"],
    ["Deviation justification","No equivalent","none","btp","Stays in the history, visible to the approver"]
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
      c3.className = "f" + (m[2] === "none" ? " none" : "");
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
          CATSHOURS: fmt(v),
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
      td.textContent = "No hours this week, so there are no records to generate.";
      tr.appendChild(td); body.appendChild(tr);
    }
    $("catsCount").textContent = recs.length + (recs.length === 1 ? " record generated" : " records generated");
    $("catsPayload").textContent =
      "// Cloud scenario: WorkforceTimesheetService, entity TimeSheetEntry\n" +
      "// On-premise scenario: BAPI_CATIMESHEETMGR_INSERT, table CATSRECORDS\n" +
      "// Property names to confirm against the client's service metadata\n\n" +
      JSON.stringify({
        requestId: "ts-2026-W" + WEEKS[weekIdx].num + "-" + PERNR,
        profile: "CONS_PT",
        release: state.submitted,
        records: recs,
        btpOnly: {
          comment: "stays in the experience layer, never enters CATSDB",
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
    var prev = WEEKS[weekIdx-1];
    var base = prev
      ? prev.rows.map(function(r){ return {p:r.p, desc:r.desc}; })
      : [
          {p:0, desc:"Requirements workshop, payroll"},
          {p:1, desc:"Time recording solution design"},
          {p:2, desc:"Rollout follow-up"},
          {p:3, desc:"Pre-sales and internal training"}
        ];
    var added = 0;
    base.forEach(function(b){
      if(state.rows.some(function(r){ return r.p === b.p; })) return;
      state.rows.push({id:nextId++, p:b.p, desc:b.desc, h:[0,0,0,0,0,0,0], origin:"Copied"});
      added++;
    });
    render();
    var first = state.rows[0];
    if(first){ var c = document.getElementById("c-"+first.id+"-0"); if(c) c.focus(); }
    toast(added ? ("Previous week's structure copied, without durations. "+added+" new rows.") : "All of last week's rows are already present.");
  }

  /* ---------- week navigation ---------- */
  function saveCurrentWeek(){
    var w = WEEKS[weekIdx];
    w.rows = state.rows;
    w.sugs = state.sugs;
    w.submitted = state.submitted;
    w.absences = ABSENCES;
  }
  function loadWeek(idx){
    weekIdx = idx;
    var w = WEEKS[weekIdx];
    WORKDATES = datesFor(w.start);
    DAYS = daysFor(WORKDATES);
    ABSENCES = w.absences;
    state.rows = w.rows;
    state.sugs = w.sugs;
    state.submitted = w.submitted;
  }
  function changeWeek(delta){
    var next = weekIdx + delta;
    if(next < 0 || next >= WEEKS.length){
      toast(delta < 0 ? "No earlier sample weeks." : "No later sample weeks.");
      return;
    }
    saveCurrentWeek();
    loadWeek(next);
    render();
  }
  function applyTemplate(){
    if(state.submitted) return;
    state.rows.forEach(function(r){
      for(var i=0; i<5; i++){ if(!r.h[i]) r.h[i] = PROJECTS[r.p].proj ? 1.5 : 0.5; }
    });
    render();
    toast("Allocation template applied to working days.", "Undo", function(){ location.reload(); });
  }
  function togglePrivate(){
    state.privateMode = !state.privateMode;
    var cap = $("capture");
    cap.classList.toggle("off", state.privateMode);
    $("captureTxt").textContent = state.privateMode ? "Capture paused" : "Suggestions on, private timeline";
    $("privBtn").textContent = state.privateMode ? "Resume capture" : "Private mode";
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
      box.appendChild(chip("waiting for text",""));
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
    var names = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"];
    if(/\byesterday\b/i.test(rest)){ day = 1; dayLabel = "yesterday, "+DAYS[1]; rest = rest.replace(/\byesterday\b/i," "); }
    else if(/\btoday\b/i.test(rest)){ day = 2; dayLabel = "today, "+DAYS[2]; rest = rest.replace(/\btoday\b/i," "); }
    else {
      for(var i=0; i<names.length; i++){
        var re = new RegExp("\\b"+names[i]+"\\b","i");
        if(re.test(rest)){ day = i; dayLabel = DAYS[day]; rest = rest.replace(re," "); break; }
      }
    }
    if(!dayLabel) dayLabel = DAYS[day];

    var pIdx = -1;
    PROJECTS.forEach(function(pr,i){
      var key = pr.code.split("-")[0];
      if(new RegExp("\\b"+key+"\\b","i").test(rest)){ pIdx = i; rest = rest.replace(new RegExp(key+"[\\w-]*","i")," "); }
    });
    var desc = rest.replace(/\s+/g," ").trim();

    box.appendChild(chipBtn(isNaN(dur) || !dur ? "duration to set" : fmt(dur)+" h", isNaN(dur) || !dur ? "warnc" : "okc", function(){
      var v = window.prompt("Duration (e.g. 1.5, 1:30, 90m)", isNaN(dur) || !dur ? "" : fmt(dur));
      if(v === null) return;
      var parsed = parseDur(v);
      if(isNaN(parsed) || parsed <= 0){ toast("Couldn't read “"+v+"”. Use 1.5, 1:30 or 90m."); return; }
      $("nlq").value = nlText(round15(parsed), day, pIdx, desc);
      parseNL();
    }));
    box.appendChild(chipBtn(dayLabel, "okc", function(){
      $("nlq").value = nlText(dur, (day + 1) % 7, pIdx, desc);
      parseNL();
    }));
    box.appendChild(chipBtn(pIdx === -1 ? "project to choose" : PROJECTS[pIdx].name, pIdx === -1 ? "warnc" : "okc", function(){
      var codes = PROJECTS.map(function(p){ return p.code.split("-")[0]; }).join(", ");
      var v = window.prompt("Project code ("+codes+")", pIdx === -1 ? "" : PROJECTS[pIdx].code.split("-")[0]);
      if(v === null) return;
      var idx = -1;
      PROJECTS.forEach(function(p,i){ if(p.code.split("-")[0].toLowerCase() === v.trim().toLowerCase()) idx = i; });
      if(idx === -1){ toast("Unknown project code “"+v+"”."); return; }
      $("nlq").value = nlText(dur, day, idx, desc);
      parseNL();
    }));
    box.appendChild(chip(pIdx === -1 ? "activity to set" : PROJECTS[pIdx].act, pIdx === -1 ? "" : "okc"));
    if(pIdx !== -1) box.appendChild(chip(PROJECTS[pIdx].sap.rproj ? "PEP "+PROJECTS[pIdx].sap.rproj : "cost center "+PROJECTS[pIdx].sap.rkostl, "okc"));
    if(desc) box.appendChild(chip("description: "+desc.slice(0,42), "okc"));

    var ok = !isNaN(dur) && dur > 0 && pIdx !== -1;
    nlParsed = ok ? {dur:round15(dur), day:day, p:pIdx, desc:desc} : null;
    $("nlSave").disabled = !ok;
  }
  function saveNL(){
    if(!nlParsed) return;
    if(isBlocked(nlParsed.day)){ toast(DAYS[nlParsed.day]+" has an approved absence, doesn't accept time entries."); return; }
    var row = state.rows.filter(function(r){ return r.p === nlParsed.p; })[0];
    if(!row){ row = {id:nextId++, p:nlParsed.p, desc:nlParsed.desc, h:[0,0,0,0,0,0,0], origin:"Manual"}; state.rows.push(row); }
    if(nlParsed.desc) row.desc = nlParsed.desc;
    row.h[nlParsed.day] += nlParsed.dur;
    render();
    toast(fmt(nlParsed.dur)+" h recorded in "+PROJECTS[nlParsed.p].code+", "+DAYS[nlParsed.day]+".");
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
    st.textContent = state.submitted ? "In approval, read-only" : "Draft";
    st.className = state.submitted ? "chip blue" : "chip grey";
    $("dtDesc").readOnly = state.submitted;
    $("dtDur").readOnly = true;
    $("dtSave").disabled = state.submitted;
    $("dlgDetail").showModal();
  }
  function saveDetail(){
    if(dtRow){ dtRow.desc = $("dtDesc").value; render(); toast("Entry updated."); }
    $("dlgDetail").close();
  }

  /* ---------- submit ---------- */
  function openSubmit(){
    $("subTitle").textContent = "Submit week " + WEEKS[weekIdx].num;
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
    tr.appendChild(el("span","","Week total"));
    tr.appendChild(el("span","", fmt(projTotal())+" h in project"));
    tr.appendChild(el("span","n", fmt(weekTotal())+" h"));
    sum.appendChild(tr);
    body.appendChild(sum);

    var warns = validate().filter(function(m){ return m.sev === "w"; });
    if(warns.length){
      var w = el("div","","");
      w.innerHTML = "<div class='field'><label>"+warns.length+" warnings, they don't block submission</label></div>";
      var ul = el("div","sum","");
      warns.forEach(function(m){
        var r = el("div","r","");
        r.appendChild(el("span","", m.txt));
        r.appendChild(el("span","chip amber","warning"));
        r.appendChild(el("span","",""));
        ul.appendChild(r);
      });
      w.appendChild(ul);
      body.appendChild(w);
      var f = el("div","field","");
      f.innerHTML = "<label for='subWhy'>Justification for the deviation from the expected total</label><textarea id='subWhy' placeholder='One line is enough. Stays in the week's history.'></textarea>";
      body.appendChild(f);
    }
    $("dlgSubmit").showModal();
  }
  function doSubmit(){
    state.submitted = true;
    $("dlgSubmit").close();
    render();
    toast("Week " + WEEKS[weekIdx].num + " submitted for approval.", "Reopen", function(){ state.submitted = false; render(); });
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
        cb.setAttribute("aria-label","Select timesheet for "+a.who);
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
          : (a.approved ? "<span class='chip green'>Approved</span>" : "<span class='chip blue'>In approval</span>");
        tr.appendChild(c7);
        body.appendChild(tr);
      });
    }
    group("No warnings, bulk approval available", clean);
    group("Exceptions, need individual review", flagged);

    var sel = state.approvals.filter(function(a){ return a.sel; }).length;
    $("apSel").textContent = sel + (sel === 1 ? " selected" : " selected");
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
  function chipBtn(txt, cls, fn){ var b = document.createElement("button"); b.type = "button"; b.className = "pchip clickable " + (cls||""); b.textContent = txt; b.onclick = fn; return b; }
  function dayWordFor(day){ var names = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"]; return names[day] !== undefined ? names[day] : names[2]; }
  function nlText(dur, day, pIdx, desc){
    var parts = [];
    if(!isNaN(dur) && dur > 0) parts.push(fmt(dur)+"h");
    parts.push(dayWordFor(day));
    if(pIdx !== -1) parts.push(PROJECTS[pIdx].code.split("-")[0]);
    if(desc) parts.push(desc);
    return parts.join(" ");
  }
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
    toast(hi.length+" high-confidence suggestions applied. Medium and low confidence ones are still to review.");
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
  $("dataWipe").onclick = function(){ $("dlgData").close(); state.sugs = []; render(); toast("Raw timeline deleted. Pending suggestions disappeared with it."); };
  $("helpBtn").onclick = function(){ $("dlgHelp").showModal(); };
  $("helpClose").onclick = function(){ $("dlgHelp").close(); };
  $("prevW").onclick = function(){ changeWeek(-1); };
  $("nextW").onclick = function(){ changeWeek(1); };

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
    toast(n+" timesheets approved in a single call. Exceptions remain for review.");
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

  /* ---------- conversational assistant, Joule pattern ---------- */
  var chat = {pending:null, greeted:false};

  function botToggle(force){
    var p = $("joulePanel");
    var open = typeof force === "boolean" ? force : p.hidden;
    p.hidden = !open;
    $("jouleFab").setAttribute("aria-expanded", open ? "true" : "false");
    if(open){
      if(!chat.greeted){
        chat.greeted = true;
        botSay("bot", "Hi Tiago. I can log hours, show the week's status, show your absences or submit the sheet. Tell me what you did, in plain language.");
        botChips(["How many hours do I have?","My absences","2h BNK testing yesterday","Submit the week"]);
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
      acts.appendChild(el("span","chip green","confirmed"));
      onConfirm();
    }));
    acts.appendChild(btn("Cancel","btn sm", function(){
      chat.pending = null;
      acts.innerHTML = "";
      acts.appendChild(el("span","chip grey","cancelled"));
      botSay("bot","No problem, I didn't save anything.");
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
    return "You have " + fmt(weekTotal()) + " h recorded of " + fmt(weekCapacity()) +
      " h expected, already with absences deducted. " +
      (errs ? errs + (errs === 1 ? " error blocks submission." : " errors block submission.") : "No errors, you can submit.");
  }

  /* assistant actions, shared between Claude (via /api/chat) and the local interpreter */
  function showAbsences(){
    var node = el("div","jlist","");
    ABSENCES.forEach(function(a){
      node.appendChild(el("div","jrow2", DAYS[a.day] + " · " + a.type + " · " + fmt(a.hours) + " h · " + ABSTATUS[a.status]));
    });
    botSay("bot","These are this week's absences, from the Leave Request. Days with an approved full-day absence don't accept time entries.", node);
    botChips(["How many hours do I have?","Copy last week"]);
  }
  function showWeekStatus(){
    botSay("bot", weekSummaryText());
    botChips(["My absences","Submit the week"]);
  }
  function showHelp(){
    botSay("bot","I can log hours, show the week's status, show your absences, copy last week, apply high-confidence suggestions, or submit the week. Just tell me what you need, in plain language, for example <span class=\"num\">2h BNK payroll testing yesterday</span>.");
    botChips(["How many hours do I have?","My absences","Copy last week","Submit the week"]);
  }
  function showSuggestionsPanel(){
    var vis = visibleSugs();
    botSay("bot", vis.length
      ? "You have " + vis.length + " suggestions to review in the side panel. I can apply the high-confidence ones, if you'd like."
      : "No suggestions to review.");
    if(vis.length) botChips(["Apply the high-confidence ones"]);
  }
  function offerApplyHighConfidence(){
    var hi = visibleSugs().filter(function(s){ return s.conf === "hi"; });
    if(!hi.length){ botSay("bot","I don't have any pending high-confidence suggestions."); return; }
    chat.pending = "sugs";
    botSay("bot","Confirm applying these suggestions?", botCard(
      hi.map(function(s){ return [DAYS[s.day] + ", " + PROJECTS[s.p].code, fmt(s.hours) + " h"]; }),
      "Apply", function(){
        hi.forEach(acceptSug);
        botSay("bot", hi.length + " suggestions applied. " + weekSummaryText());
      }));
  }
  function offerCopyWeek(){
    chat.pending = "copy";
    botSay("bot","I can bring in last week's structure, without durations.", botCard(
      [["Action","copy last week's rows"],["Durations","stay at zero"]],
      "Copy", function(){ copyWeek(); botSay("bot","Done. The rows are created, durations still need filling in."); }));
  }
  function offerSubmit(){
    if(state.submitted){ botSay("bot","The week is already submitted and in approval."); return; }
    var errs = errors();
    if(errs.length){
      botSay("bot","I can't submit yet. " + errs[0].txt);
      botChips(["How many hours do I have?"]);
      return;
    }
    chat.pending = "submit";
    botSay("bot","Confirm submitting week " + WEEKS[weekIdx].num + "?", botCard(
      [["Total","" + fmt(weekTotal()) + " h"],["Expected","" + fmt(weekCapacity()) + " h"],["Status after submitting","In approval"]],
      "Submit", function(){ doSubmit(); botSay("bot","Week submitted. It's now in approval with the project manager."); }));
  }
  function offerEntry(day, dur, pIdx, desc){
    var pr = PROJECTS[pIdx];
    var alt = null;
    if(isBlocked(day)){
      alt = nextFreeDay();
      if(alt === -1){
        botSay("bot", DAYS[day] + " has an approved " + absOn(day,"approved")[0].type.toLowerCase() + " and there's no other day with free capacity. I didn't record anything.");
        return;
      }
      botSay("bot", DAYS[day] + " has an approved " + absOn(day,"approved")[0].type.toLowerCase() + ", so it doesn't accept hours. I suggest " + DAYS[alt] + ".");
      day = alt;
    }
    var livre = capacity(day) - dayTotal(day);
    var warn = null;
    if(dur > livre){
      warn = "This entry leaves the day at " + fmt(dayTotal(day) + dur) + " h, above the capacity of " + fmt(capacity(day)) + " h. It will raise an error at submission.";
    }
    chat.pending = "entry";
    botSay("bot","Confirm this entry?", botCard([
      ["Day", DAYS[day]],
      ["Duration", fmt(dur) + " h"],
      ["Project", pr.name],
      ["Receiver object", pr.sap.rproj ? "PEP " + pr.sap.rproj : "Cost center " + pr.sap.rkostl],
      ["Activity type", pr.sap.lstar + ", " + pr.act],
      ["Description", desc || "(to be filled in)"],
      ["Origin", "Joule"]
    ], "Save", function(){
      var row = state.rows.filter(function(r){ return r.p === pIdx; })[0];
      if(!row){ row = {id:nextId++, p:pIdx, desc:desc, h:[0,0,0,0,0,0,0], origin:"Joule"}; state.rows.push(row); }
      if(desc) row.desc = desc;
      row.origin = "Joule";
      row.h[day] += dur;
      render();
      botSay("bot", fmt(dur) + " h saved on " + DAYS[day] + ", " + pr.code + ". " + weekSummaryText());
      botChips(["Submit the week","My absences"]);
    }, warn));
  }

  /* asks Claude, at /api/chat, to interpret the text and choose a function.
     Returns null on any failure (no key configured, network, engine error),
     and in that case the caller falls back to the local regex interpreter. */
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

  /* maps Claude's response (function + arguments) to the same bot actions */
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
          botSay("bot", intent.texto || "I couldn't confirm all the details for that entry. Could you write it another way?");
          botChips(["How many hours do I have?","My absences"]);
          return true;
        }
        offerEntry(dayIdx, dur, pIdx, a.descricao || "");
        return true;
      default:
        if(intent.texto){
          botSay("bot", intent.texto);
          botChips(["How many hours do I have?","My absences","Help"]);
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

  /* local regex interpreter, used when Claude isn't configured or fails */
  function botHandleLocal(txt){
    var t = txt.toLowerCase();

    /* help */
    if(/\bhelp\b|what can you do|what do you do|how does this work/.test(t)){ showHelp(); return; }
    /* absences */
    if(/absen|vacation|holiday|leave|time off/.test(t)){ showAbsences(); return; }
    /* week status */
    if(/how many hours|week status|status|summary|how('| i)?s (the week|it going)/.test(t)){ showWeekStatus(); return; }
    /* suggestions */
    if(/suggest/.test(t) && !/high.confidence/.test(t)){ showSuggestionsPanel(); return; }
    if(/high.confidence/.test(t)){ offerApplyHighConfidence(); return; }
    /* copy week */
    if(/copy|last week|previous week/.test(t)){ offerCopyWeek(); return; }
    /* submit */
    if(/submit|send the week|close the week/.test(t)){ offerSubmit(); return; }

    /* time entry, reuses the same parser as quick add */
    var p = botParse(txt);
    if(!p){
      botSay("bot","I couldn't understand what to record. Write the duration and the project, for example <span class=\"num\">2h BNK payroll testing yesterday</span>. I can also show the week's status or your absences.");
      botChips(["How many hours do I have?","My absences","Help"]);
      return;
    }
    offerEntry(p.day, p.dur, p.p, p.desc);
  }

  /* assistant parser: duration, day and project */
  function botParse(txt){
    var rest = " " + txt + " ", m, dur = NaN;
    if((m = rest.match(/(\d+(?:[.,]\d+)?)\s*h/i))){ dur = parseDur(m[1]); rest = rest.replace(m[0]," "); }
    else if((m = rest.match(/(\d{1,2}):(\d{2})/))){ dur = parseDur(m[0]); rest = rest.replace(m[0]," "); }
    else if((m = rest.match(/(\d+)\s*m(?:in)?\b/i))){ dur = parseDur(m[1]+"m"); rest = rest.replace(m[0]," "); }
    else if((m = rest.match(/\s(\d+(?:[.,]\d+)?)\s/))){ dur = parseDur(m[1]); rest = rest.replace(m[0]," "); }
    if(isNaN(dur) || dur <= 0) return null;

    var day = 2;
    if(/\byesterday\b/i.test(rest)){ day = 1; rest = rest.replace(/\byesterday\b/i," "); }
    else if(/\btoday\b/i.test(rest)){ day = 2; rest = rest.replace(/\btoday\b/i," "); }
    else {
      var names = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"];
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
    else if(ev.key === "ArrowLeft"){ ev.preventDefault(); changeWeek(-1); }
    else if(ev.key === "ArrowRight"){ ev.preventDefault(); changeWeek(1); }
    else if(ev.key === "?"){ ev.preventDefault(); $("dlgHelp").showModal(); }
  });

  render();
})();
