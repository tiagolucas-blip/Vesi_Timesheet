(function(){
  "use strict";

  var DAYS = [];
  /* bukrs ties a project to the company it belongs to, so staffing stays
     thematically consistent: a payroll or WFM engagement is consulting
     work (PT01), a facilities engagement is building solutions (PT02).
     null means shared, open internal work, not tied to either theme. */
  var PROJECTS = [
    {code:"BNK-2026", wbs:"BNK-2026.1.3", name:"Banking, Payroll and ECP", act:"Functional consulting", proj:true, bukrs:"PT01",
     sap:{rproj:"BNK-2026.1.3", lstar:"CONS01", skostl:"PT4010", rkostl:"", aufnr:""}},
    {code:"RTL-TT", wbs:"RTL-TT.2.1", name:"Retail, Time Tracking", act:"Functional consulting", proj:true, bukrs:"PT01",
     sap:{rproj:"RTL-TT.2.1", lstar:"CONS01", skostl:"PT4010", rkostl:"", aufnr:""}},
    {code:"AER-WFM", wbs:"AER-WFM.4.2", name:"Airports, WFM rollout", act:"Project management", proj:true, bukrs:"PT01",
     sap:{rproj:"AER-WFM.4.2", lstar:"PMGT01", skostl:"PT4010", rkostl:"", aufnr:""}},
    {code:"AXI-INT", wbs:"", name:"Internal, pre-sales and training", act:"Administrative", proj:false, bukrs:null,
     sap:{rproj:"", lstar:"ADMIN1", skostl:"PT4010", rkostl:"PT4010", aufnr:""}},
    {code:"HSP-FAC", wbs:"HSP-FAC.1.1", name:"Hospital campus, facilities maintenance", act:"Field service", proj:true, bukrs:"PT02",
     sap:{rproj:"HSP-FAC.1.1", lstar:"MAINT01", skostl:"PT4010", rkostl:"", aufnr:""}}
  ];
  var PERNR = "00104567";
  var WORKDATES = [];
  var DAYCAP = 8;

  /* ---------- companies, IT0001 and CATS data entry profiles ----------
     The entry mode is a business setting per company, never a user preference.
     The company comes from the employee's IT0001 (Organizational Assignment)
     and ZTIME_COMPANY_CFG maps it to a CATS data entry profile, with validity
     dates, so a retroactive entry keeps the profile that was in force then.
     Start and end are BEGUZ and ENDUZ, standard CATSDB fields whose visibility
     is controlled by the profile, not by code in this application. */
  var COMPANIES = [
    {bukrs:"PT01", name:"Consulting and digital services"},
    {bukrs:"PT02", name:"Building solutions and maintenance"}
  ];
  var PROFILES = {
    Z_CONS:{code:"Z_CONS", name:"Consultants",       clock:false, overnight:false, fields:"Date, project, duration"},
    Z_BSRV:{code:"Z_BSRV", name:"Building Solutions", clock:true,  overnight:true,  fields:"Date, project, start, end, computed duration"}
  };
  var ZTIME_COMPANY_CFG = [
    {bukrs:"PT01", begda:"20200101", endda:"99991231", profile:"Z_CONS"},
    {bukrs:"PT02", begda:"20200101", endda:"99991231", profile:"Z_BSRV"}
  ];
  var DEFAULT_PROFILE = "Z_CONS";

  /* IT0001 of the person using the application. The switch in the header changes
     it, which is the same as opening the sheet as someone assigned to the other
     company. Nothing else in the application decides the entry mode.
     dailyHours is the example of a reduced work schedule (part-time): the
     same capacity every working day, only meaningful for consulting, where
     each day is expected to reach it. Omitted/8 means a standard schedule. */
  var IT0001 = {pernr:PERNR, bukrs:"PT01", dailyHours:6};
  function dailyCapFor(){ return (IT0001.bukrs === "PT01" && IT0001.dailyHours) ? IT0001.dailyHours : DAYCAP; }

  function profileCodeFor(bukrs, dateISO){
    var hit = ZTIME_COMPANY_CFG.filter(function(c){
      return c.bukrs === bukrs && c.begda <= dateISO && c.endda >= dateISO;
    })[0];
    return hit ? hit.profile : DEFAULT_PROFILE;
  }
  /* Read at the date of the entry, not today, so history is never reinterpreted. */
  function profileFor(dateISO, bukrs){
    return PROFILES[profileCodeFor(bukrs || IT0001.bukrs, dateISO || WORKDATES[0])];
  }
  function isClock(){ return profileFor(WORKDATES[0]).clock; }
  function companyName(bukrs){
    var c = COMPANIES.filter(function(x){ return x.bukrs === bukrs; })[0];
    return c ? c.name : bukrs;
  }

  /* ---------- period control, monthly, per company ----------
     A closed period rejects new entries and changes. Reopening is an HR action
     and leaves a trace. */
  var PERIODS = [
    {bukrs:"PT01", ym:"202608", open:false, by:"HR, 3 Sep 2026"},
    {bukrs:"PT01", ym:"202609", open:true,  by:""},
    {bukrs:"PT01", ym:"202610", open:true,  by:""},
    {bukrs:"PT02", ym:"202608", open:false, by:"HR, 3 Sep 2026"},
    {bukrs:"PT02", ym:"202609", open:true,  by:""},
    {bukrs:"PT02", ym:"202610", open:true,  by:""}
  ];
  function periodFor(dateISO, bukrs){
    var b = bukrs || IT0001.bukrs, ym = String(dateISO).slice(0,6);
    return PERIODS.filter(function(p){ return p.bukrs === b && p.ym === ym; })[0] || {bukrs:b, ym:ym, open:true, by:""};
  }
  function periodOpen(dateISO, bukrs){ return periodFor(dateISO, bukrs).open !== false; }
  function weekPeriodClosed(){
    for(var i=0; i<5; i++){ if(!periodOpen(WORKDATES[i])) return true; }
    return false;
  }

  /* ---------- wage type catalogue ----------
     Every allowance is a wage type valid in T512Z and authorised in the data
     entry profile. Quantity goes to ANZHL. The bonus is the only one carrying
     an amount, which CATSDB has no field for, so it travels in a customer
     field and is created by the project owner, never by the employee. */
  var WAGETYPES = [
    {code:"AJC_NAC", lgart:"1200", name:"Domestic per diem",  unit:"days",   amount:false, needProj:true,  noteLabel:"",                     selfEntry:true},
    {code:"AJC_INT", lgart:"1210", name:"Foreign per diem",   unit:"days",   amount:false, needProj:true,  noteLabel:"Country",              selfEntry:true},
    {code:"KMS",     lgart:"1300", name:"Own-car kilometres", unit:"km",     amount:false, needProj:true,  noteLabel:"Origin and destination", selfEntry:true},
    {code:"TURNO",   lgart:"1500", name:"Shift allowance",    unit:"days",   amount:false, needProj:false, noteLabel:"",                     selfEntry:true},
    {code:"BONUS",   lgart:"1400", name:"Project bonus",      unit:"amount", amount:true,  needProj:true,  noteLabel:"Reason",               selfEntry:false}
  ];
  function wt(code){ return WAGETYPES.filter(function(w){ return w.code === code; })[0]; }
  function wtFor(bukrs){
    /* Shift allowance only makes sense where people work shifts. */
    return WAGETYPES.filter(function(w){ return w.code !== "TURNO" || (bukrs || IT0001.bukrs) === "PT02"; });
  }

  /* ---------- team, for the leader's mass entry ----------
     Scope is strictly by project ownership, never by line management: the
     team a leader sees in mass entry is everyone allocated to the project
     currently picked above the grid, whatever their manager in IT0001/OM
     is. Rui Tavares is the deliberate exception: he works on Pedro Alves's
     project (AER-WFM) and also on Ana Ferreira's (BNK-2026), independently
     of who he reports to in the org chart. Every other consultant sits on
     exactly one project - a Junior consultant showing up under a project
     they don't actually work on isn't a multi-project feature, it's wrong
     data - so Rui stays the one, named example of it, not the norm. Each
     project's roster is 5 people, a realistic engagement team size. A
     leader can still own more than one project at once, as Ricardo Nunes
     does here: switching the project picker switches which 5-person
     roster is on screen. */
  var LEADERS = [
    {id:"RN", name:"Ricardo Nunes", label:"RTL-TT + AXI-INT", projs:[1,3], bukrs:"PT01"},
    {id:"PA", name:"Pedro Alves",   label:"AER-WFM", projs:[2], bukrs:"PT01"},
    {id:"AF", name:"Ana Ferreira",  label:"BNK-2026", projs:[0], bukrs:"PT01"},
    {id:"CP", name:"Carlos Pinto",  label:"HSP-FAC", projs:[4], bukrs:"PT02"}
  ];
  var TEAM = [
    /* BNK-2026 */
    {pernr:"00104501", name:"Marta Silva",     role:"Consultant",        bukrs:"PT01", projs:[0],   abs:{}, already:[8,8,4,0,0,0,0]},
    {pernr:"00104504", name:"Rui Tavares",     role:"Consultant",        bukrs:"PT01", projs:[0,2], abs:{}, already:[8,0,8,0,0,0,0]},
    {pernr:"00104513", name:"Beatriz Costa",   role:"Consultant",        bukrs:"PT01", projs:[0],   abs:{}, already:[8,8,0,0,0,0,0]},
    {pernr:"00104514", name:"Tiago Almeida",   role:"Consultant",        bukrs:"PT01", projs:[0],   abs:{3:"Medical appointment"}, already:[8,4,0,0,0,0,0]},
    {pernr:"00104515", name:"Mariana Neves",   role:"Junior consultant", bukrs:"PT01", projs:[0],   abs:{}, already:[0,8,8,0,0,0,0]},
    /* RTL-TT */
    {pernr:"00104502", name:"João Costa",      role:"Consultant",        bukrs:"PT01", projs:[1],   abs:{4:"Vacation"}, already:[4,4,4,4,0,0,0]},
    {pernr:"00104503", name:"Inês Braga",      role:"Junior consultant", bukrs:"PT01", projs:[1],   abs:{}, locked:true, already:[8,8,8,8,8,0,0]},
    {pernr:"00104516", name:"Vera Antunes",    role:"Consultant",        bukrs:"PT01", projs:[1],   abs:{}, already:[8,0,8,0,0,0,0]},
    {pernr:"00104517", name:"Gonçalo Pinheiro",role:"Senior consultant", bukrs:"PT01", projs:[1],   abs:{}, already:[8,8,8,0,0,0,0]},
    {pernr:"00104518", name:"Teresa Correia",  role:"Consultant",        bukrs:"PT01", projs:[1],   abs:{1:"Vacation"}, already:[8,0,4,0,0,0,0]},
    /* AER-WFM */
    {pernr:"00104505", name:"Sofia Marques",   role:"Architect",         bukrs:"PT01", projs:[2],   abs:{2:"Medical appointment"}, already:[0,4,4,8,0,0,0]},
    {pernr:"00104519", name:"Vasco Pereira",   role:"Architect",         bukrs:"PT01", projs:[2],   abs:{}, already:[8,8,4,0,0,0,0]},
    {pernr:"00104520", name:"Miguel Santos",   role:"Consultant",        bukrs:"PT01", projs:[2],   abs:{}, already:[4,4,0,0,0,0,0]},
    {pernr:"00104521", name:"Rita Nunes",      role:"Consultant",        bukrs:"PT01", projs:[2],   abs:{}, already:[8,0,0,0,0,0,0]},
    /* AXI-INT */
    {pernr:"00104523", name:"Bárbara Moreira", role:"Consultant",        bukrs:"PT01", projs:[3],   abs:{}, already:[4,0,0,0,0,0,0]},
    {pernr:"00104524", name:"Eduardo Cardoso", role:"Junior consultant", bukrs:"PT01", projs:[3],   abs:{},  already:[0,4,4,0,0,0,0]},
    {pernr:"00104525", name:"Sara Martins",    role:"Consultant",        bukrs:"PT01", projs:[3],   abs:{0:"Vacation"}, already:[0,4,0,0,0,0,0]},
    {pernr:"00104526", name:"Cláudia Ribeiro", role:"Architect",         bukrs:"PT01", projs:[3],   abs:{}, already:[8,0,4,0,0,0,0]},
    {pernr:"00104527", name:"Diogo Ferreira",  role:"Consultant",        bukrs:"PT01", projs:[3],   abs:{}, already:[0,0,0,4,0,0,0]},
    /* HSP-FAC */
    {pernr:"00104510", name:"Nuno Dias",       role:"Technician",        bukrs:"PT02", projs:[4],   abs:{}, already:[8,8,0,0,0,0,0]},
    {pernr:"00104511", name:"Hélder Rocha",    role:"Technician",        bukrs:"PT02", projs:[4],   abs:{}, already:[0,0,8,8,8,0,0]},
    {pernr:"00104512", name:"Hugo Matos",      role:"Technician",        bukrs:"PT02", projs:[4],   abs:{1:"Vacation"}, already:[8,0,8,8,0,0,0]},
    {pernr:"00104528", name:"Luís Teixeira",   role:"Technician",        bukrs:"PT02", projs:[4],   abs:{}, already:[8,8,8,0,0,0,0]},
    {pernr:"00104529", name:"Sandra Fonseca",  role:"Senior technician", bukrs:"PT02", projs:[4],   abs:{}, already:[0,8,8,8,0,0,0]}
  ];
  function leaderById(id){ return LEADERS.filter(function(l){ return l.id === id; })[0] || LEADERS[0]; }
  function teamOf(leaderId){
    var l = leaderById(leaderId);
    var pIdx = massProject();
    /* If the currently selected project isn't even one of this leader's
       own (mid leader-switch, before #mProj's options are re-synced),
       fall back to the union of their projects rather than an empty or
       wrong-leader team; renderTeam() re-syncs #mProj before this runs in
       the normal render path, so this only guards the edge case. */
    if(l.projs.indexOf(pIdx) === -1){
      return TEAM.filter(function(m){
        return m.projs.some(function(p){ return l.projs.indexOf(p) !== -1; });
      });
    }
    return TEAM.filter(function(m){ return isEligibleForProject(m, pIdx); });
  }
  function projectsOf(leaderId){
    return leaderById(leaderId).projs;
  }
  /* Hours, Allowances and Bonus each re-implement "is this team member
     actually on the project a mass entry is about to bill to" - the exact
     check an earlier pass missed for Allowances when leaders went from one
     project to several. One shared predicate instead of three copies, so
     the next feature can't leave it out the same way. */
  function isEligibleForProject(m, pIdx){
    return m.projs.indexOf(pIdx) !== -1;
  }
  /* Leaders stay in one company, whatever number of projects they own:
     "acting as" only offers leaders of the company IT0001 currently reads,
     the same rule Team entry already applies to who counts as someone's
     team. */
  function leadersForCompany(bukrs){
    return LEADERS.filter(function(l){ return l.bukrs === bukrs; });
  }
  function renderLeaderOptions(){
    var ls = $("leadSel");
    if(!ls) return;
    var opts = leadersForCompany(IT0001.bukrs);
    if(opts.indexOf(leaderById(state.leader)) === -1 && opts.length){
      state.leader = opts[0].id;
    }
    ls.innerHTML = "";
    opts.forEach(function(l){
      var o = document.createElement("option");
      o.value = l.id; o.textContent = l.name + " · " + l.label;
      ls.appendChild(o);
    });
    ls.value = state.leader;
  }
  /* Hours the person already has recorded this week, from their own sheet or a
     previous mass entry, so the leader can see day load before staging more.
     Sample only: weeks already posted or submitted are treated as complete on
     their working days, next week has nothing yet, and this week has the hand
     authored gaps in TEAM[].already, deliberately including someone already
     at capacity so the "day already full" case is visible without more clicks. */
  function alreadyHoursFor(m, weekNum){
    var base;
    if(weekNum >= 38) base = (m.already || [0,0,0,0,0,0,0]).slice();
    else base = [0,1,2,3,4].reduce(function(acc,d){ acc[d] = m.abs[d] ? 0 : 8; return acc; }, [0,0,0,0,0,0,0]);
    /* the sample "already" figures are a static baseline and never move;
       without this, saving a mass entry made the read-only grid look like
       the save had been lost the moment it succeeded, since staged (now 0)
       was the only thing that had ever added to that baseline. */
    state.massLog.forEach(function(e){
      if(e.kind !== "hours" || e.pernr !== m.pernr) return;
      var idx = WORKDATES.indexOf(e.date);
      if(idx !== -1) base[idx] += e.hours;
    });
    return base;
  }
  /* Weekdays (Mon-Fri) with zero hours for this person: nothing already
     saved, nothing staged now, no approved absence and the period open -
     the same three checks saveMass() itself applies, computed up front so
     a "fill the gaps" request can target exactly the days that are
     actually empty, one person at a time, instead of one day set forced
     onto everyone selected. */
  function missingWeekdaysFor(m){
    var already = alreadyHoursFor(m, WEEKS[weekIdx].num);
    var st = stagedOf(m.pernr);
    var days = [];
    for(var d=0; d<5; d++){
      if(already[d] || st.h[d]) continue;
      if(memberBlocked(m,d)) continue;
      if(!periodOpen(WORKDATES[d], m.bukrs)) continue;
      days.push(d);
    }
    return days;
  }

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
  /* Builds the weekday name and date number as two separate lines, always,
     so every column header wraps the same way regardless of how wide each
     abbreviation happens to render (natural text wrap broke that: some
     day+number pairs fit one line, others didn't, at the same 58px width). */
  function appendDayLabel(cell, i){
    cell.appendChild(el("span","dname", WEEKDAY_ABBR[i]));
    cell.appendChild(el("span","dnum", "" + (+WORKDATES[i].slice(6,8))));
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
  /* Sample weeks are per company, keyed by the same num/start so the
     week navigator stays aligned: switching IT0001 is opening the sheet
     as someone assigned to that company, projects and absences included,
     not just a different input layout. */
  var WEEKS_PT01 = [
    { num:35, start:"20260824", submitted:true,
      absences:[],
      rows:[
        {id:96, p:0, desc:"Payroll cutover planning", h:[4,4,4,4,4,0,0], origin:"Manual"},
        {id:97, p:1, desc:"Time tracking rollout scoping", h:[4,4,4,4,4,0,0], origin:"Manual"}
      ],
      allow:[],
      sugs:[]
    },
    { num:36, start:"20260831", submitted:true,
      absences:[],
      rows:[
        {id:101, p:0, desc:"Payroll cutover testing", h:[4,4,4,4,4,0,0], origin:"Manual"},
        {id:102, p:1, desc:"Time tracking rollout support", h:[4,4,4,4,4,0,0], origin:"Manual"}
      ],
      allow:[],
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
      allow:[],
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
        {id:2, p:1, desc:"Time recording solution design", h:[2,0,2,0,0,0,0], origin:"Suggested"},
        {id:3, p:3, desc:"", h:[1,0,0,1.5,0,0,0], origin:"Manual"}
      ],
      allow:[
        {id:"al1", day:0, p:0, code:"AJC_NAC", qty:1,  amount:0, note:"", by:"00104567", onBehalf:"00104567"},
        {id:"al2", day:0, p:0, code:"KMS",     qty:86, amount:0, note:"Lisbon to Porto and back", by:"00104567", onBehalf:"00104567"}
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
      allow:[],
      sugs:[
        {id:"s5", hours:2, day:1, p:0, why:"2 client meetings on the calendar", conf:"hi", desc:"Payroll steering follow-up"}
      ]
    },
    { num:40, start:"20260928", submitted:false,
      absences:[
        {id:"ab40a", day:1, type:"Medical appointment", awart:"0210", hours:2, status:"approved", src:"Request 4500270"}
      ],
      rows:[
        {id:98, p:0, desc:"Payroll go-live support", h:[4,4,0,4,0,0,0], origin:"Manual"},
        {id:94, p:2, desc:"WFM rollout stabilization", h:[0,0,4,0,0,0,0], origin:"Manual"}
      ],
      allow:[],
      sugs:[
        {id:"s6", hours:2, day:3, p:0, why:"3 tickets handled in Cloud ALM", conf:"hi", desc:"Payroll post-go-live fixes"}
      ]
    },
    { num:41, start:"20261005", submitted:false,
      absences:[],
      rows:[
        {id:95, p:1, desc:"Retail rollout wave 2 kickoff", h:[4,4,0,0,0,0,0], origin:"Manual"}
      ],
      allow:[],
      sugs:[]
    }
  ];
  var WEEKS_PT02 = [
    { num:36, start:"20260831", submitted:true,
      absences:[],
      rows:[
        {id:501, p:4, desc:"Elevator preventive maintenance", h:[4,4,4,4,4,0,0], origin:"Manual"},
        {id:502, p:3, desc:"Site safety briefing", h:[1,0,1,0,0,0,0], origin:"Manual"}
      ],
      allow:[],
      sugs:[]
    },
    { num:37, start:"20260907", submitted:true,
      absences:[
        {id:"pb37a", day:3, type:"Medical appointment", awart:"0210", hours:2, status:"approved", src:"Request 4500205"}
      ],
      rows:[
        {id:503, p:4, desc:"HVAC filter replacement round", h:[4,4,4,0,4,0,0], origin:"Manual"},
        {id:504, p:4, desc:"Fire safety systems check", h:[0,0,0,3,0,0,0], origin:"Suggested"}
      ],
      allow:[],
      sugs:[]
    },
    { num:38, start:"20260914", submitted:false,
      absences:[
        {id:"pb1", day:2, type:"Medical appointment", awart:"0210", hours:4, status:"approved", src:"Request 4500219"},
        {id:"pb2", day:4, type:"Vacation", awart:"0100", hours:8, status:"approved", src:"Request 4500221"},
        {id:"pb3", day:3, type:"Vacation", awart:"0100", hours:8, status:"pending", src:"Request 4500230"}
      ],
      rows:[
        {id:511, p:4, desc:"Boiler room inspection", h:[3,4,0,2,0,0,0], origin:"Manual"},
        {id:512, p:4, desc:"Elevator call-out repair", h:[2,0,3,0,0,0,0], origin:"Suggested"},
        {id:513, p:3, desc:"", h:[1,0,0,1.5,0,0,0], origin:"Manual"}
      ],
      allow:[
        {id:"pal1", day:0, p:4, code:"TURNO", qty:1,  amount:0, note:"", by:"00104567", onBehalf:"00104567"},
        {id:"pal2", day:0, p:4, code:"KMS",   qty:42, amount:0, note:"Depot to hospital campus and back", by:"00104567", onBehalf:"00104567"}
      ],
      sugs:[
        {id:"ps1", hours:2.5, day:2, p:4, why:"3 work orders closed in the maintenance log", conf:"hi", desc:"Follow-up repairs"},
        {id:"ps2", hours:1.5, day:3, p:4, why:"12 changes in the maintenance ticket system", conf:"hi", desc:"HVAC configuration"},
        {id:"ps3", hours:2, day:4, p:4, why:"4 tickets handled in Cloud ALM", conf:"mid", desc:"Post-inspection fixes"},
        {id:"ps4", hours:1, day:4, p:3, why:"Block with no attributable signal", conf:"low", desc:""}
      ]
    },
    { num:39, start:"20260921", submitted:false,
      absences:[
        {id:"pb39a", day:0, type:"Vacation", awart:"0100", hours:8, status:"pending", src:"Request 4500255"}
      ],
      rows:[],
      allow:[],
      sugs:[
        {id:"ps5", hours:2, day:1, p:4, why:"2 work orders on the maintenance calendar", conf:"hi", desc:"Facilities steering follow-up"}
      ]
    }
  ];
  var WEEKS = WEEKS_PT01;
  var weekIdx = 3; // week 38, the default landing week (index shifts whenever a week is added before it)
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
    return Math.max(0, dailyCapFor() - absHours(day));
  }
  function isBlocked(day){ return day <= 4 && capacity(day) === 0; }
  function weekCapacity(){
    var c = 0;
    for(var i=0; i<5; i++) c += capacity(i);
    return c;
  }

  /* ---------- monthly reporting, consulting only ----------
     Building Solutions stays weekly, unchanged. Consulting reports by
     calendar month, so the weekly data underneath (still one object per
     week, with its own rows/absences/allow) is grouped and shown together
     instead of navigated week by week.
     The *Of() helpers below take a week explicitly and never read the
     app's single "current week" globals - a month cell's own input handler
     always has to use the capacity/absences of the week it actually sits
     in, whichever week the rest of the app happens to be pointed at. */
  function isMonthly(){ return IT0001.bukrs === "PT01"; }
  /* A week that spans two calendar months (e.g. starts the last Monday of
     August, mostly runs into September) belongs to whichever month has
     most of its 7 days, not to the month its start date happens to fall
     in - otherwise a week that's six-sevenths September gets filed under
     August, and the September grid opens on day 7 with nothing before it. */
  function monthKeyOf(week){
    var counts = {};
    datesFor(week.start).forEach(function(d){
      var k = d.slice(0,6);
      counts[k] = (counts[k] || 0) + 1;
    });
    var best = week.start.slice(0,6), bestN = -1;
    Object.keys(counts).forEach(function(k){ if(counts[k] > bestN){ bestN = counts[k]; best = k; } });
    return best;
  }
  /* All the calendar dates of a YYYYMM month, and which week+day-index
     (into the underlying WEEKS data) each one comes from. This is the
     actual rendering unit for the monthly view - not "the weeks this
     month owns" (monthKeyOf, used only to order months for prev/next) -
     so a day from a neighbouring month never shows, and every day this
     month actually has shows, even from a week whose majority belongs
     to a different month (its non-matching days just aren't in the
     list). */
  function monthDatesFor(ym){
    var y = +ym.slice(0,4), m = +ym.slice(4,6) - 1;
    var daysInMonth = new Date(Date.UTC(y, m+1, 0)).getUTCDate();
    var out = [];
    for(var d=1; d<=daysInMonth; d++) out.push(ym + (d < 10 ? "0"+d : ""+d));
    return out;
  }
  function weekDayFor(dateISO){
    for(var i=0; i<WEEKS.length; i++){
      var idx = datesFor(WEEKS[i].start).indexOf(dateISO);
      if(idx !== -1) return {week:WEEKS[i], day:idx};
    }
    return null;
  }
  function activeMonthDates(){
    return monthDatesFor(monthKeyOf(WEEKS[weekIdx])).filter(function(d){ return weekDayFor(d); });
  }
  function touchedWeeksFor(dates){
    var seen = {}, out = [];
    dates.forEach(function(d){
      var wd = weekDayFor(d);
      if(wd && !seen[wd.week.num]){ seen[wd.week.num] = 1; out.push(wd.week); }
    });
    return out;
  }
  function activeMonthWeeks(){ return touchedWeeksFor(activeMonthDates()); }
  function absHoursOf(week, day){
    return week.absences.filter(function(a){ return a.day === day && a.status === "approved"; })
      .reduce(function(s,a){ return s + a.hours; }, 0);
  }
  function capacityOf(week, day){
    if(day > 4) return 0;
    return Math.max(0, dailyCapFor() - absHoursOf(week, day));
  }
  function isBlockedOf(week, day){ return day <= 4 && capacityOf(week, day) === 0; }
  function weekCapacityOf(week){
    var c = 0;
    for(var i=0; i<5; i++) c += capacityOf(week, i);
    return c;
  }
  function dayTotalOf(week, day){
    return week.rows.reduce(function(a,r){ return a + (r.h[day] || 0); }, 0);
  }
  function weekTotalOf(week){
    return week.rows.reduce(function(a,r){ return a + rowTotal(r); }, 0);
  }
  function cellLockedOf(week, day, v){
    return week.submitted || !periodOpen(datesFor(week.start)[day]) || (isBlockedOf(week, day) && !v);
  }
  /* Points the app's single-week globals at `week`, runs fn(), restores
     them. Safe only for code that finishes before this call returns -
     never for an event handler whose closure outlives it, which is why
     month grid cells use the *Of() helpers above instead of this. */
  function withWeek(week, fn){
    var savedIdx = weekIdx, savedRows = state.rows, savedAllow = state.allow, savedSugs = state.sugs,
        savedAbs = ABSENCES, savedDates = WORKDATES, savedDays = DAYS, savedSubmitted = state.submitted;
    weekIdx = WEEKS.indexOf(week);
    ABSENCES = week.absences;
    WORKDATES = datesFor(week.start);
    DAYS = daysFor(WORKDATES);
    state.rows = week.rows;
    state.allow = week.allow || (week.allow = []);
    state.sugs = week.sugs || [];
    state.submitted = week.submitted;
    var result = fn(week);
    weekIdx = savedIdx; ABSENCES = savedAbs; WORKDATES = savedDates; DAYS = savedDays;
    state.rows = savedRows; state.allow = savedAllow; state.sugs = savedSugs; state.submitted = savedSubmitted;
    return result;
  }
  /* Only the weeks still open need to be error-free to submit the month -
     an already-submitted week (its own history, frozen before this month
     even existed as a grouping) can carry an old conflict, like hours on
     a day whose period closed after the fact, without holding the weeks
     that still need submitting hostage to it. A day-specific error whose
     date falls outside this month (a boundary week straddling two months)
     doesn't block this month either - that day belongs to the other one. */
  function monthErrors(dates){
    var out = [];
    touchedWeeksFor(dates).filter(function(w){ return !w.submitted; }).forEach(function(w){
      withWeek(w, function(){
        validate().filter(function(m){ return m.sev === "e"; }).forEach(function(m){
          if(typeof m.day === "number" && dates.indexOf(datesFor(w.start)[m.day]) === -1) return;
          m.week = w;
          out.push(m);
        });
      });
    });
    return out;
  }
  function monthCapacityTotal(dates){
    return dates.reduce(function(a,d){ var wd = weekDayFor(d); return a + (wd ? capacityOf(wd.week, wd.day) : 0); }, 0);
  }
  function monthTotalHours(dates){
    return dates.reduce(function(a,d){ var wd = weekDayFor(d); return a + (wd ? dayTotalOf(wd.week, wd.day) : 0); }, 0);
  }
  /* One logical row per project across the whole month, sourced from
     whichever weeks already have a row for it; desc is shared, taken from
     the first week that has one. Hours stay per week, read through
     monthRowIn() below - there is no merged hours array. */
  function monthProjectRows(weeks){
    var byP = {}, order = [];
    weeks.forEach(function(w){
      w.rows.forEach(function(r){
        if(!byP[r.p]){ byP[r.p] = {p:r.p, desc:r.desc || ""}; order.push(r.p); }
        else if(!byP[r.p].desc && r.desc) byP[r.p].desc = r.desc;
      });
    });
    return order.map(function(p){ return byP[p]; });
  }
  function monthRowIn(week, p){
    return week.rows.filter(function(r){ return r.p === p; })[0] || null;
  }

  var state = {
    submitted: WEEKS[weekIdx].submitted,
    privateMode:false,
    rows: WEEKS[weekIdx].rows,
    allow: WEEKS[weekIdx].allow,
    sugs: WEEKS[weekIdx].sugs,
    deviationNote: WEEKS[weekIdx].deviationNote || "",
    leader: "RN",
    staged: {},
    stagedAllow: [],
    massLog: [],
    /* pure display state, not part of the timesheet data: which mass-entry
       tab is showing, and whether the person has manually opened/closed
       Suggestions this session (null = follow the automatic empty/non-empty
       guess) */
    teamTab: "hours",
    sugManualOpen: null,
    /* which top-level screen is showing right now: "semana" (My week),
       "team", "aprov" or "cats" - lets the assistant tell a personal
       request from a team one when the wording alone is ambiguous */
    screen: "semana",
    approvals:[
      {who:"Ana Ferreira", role:"Senior consultant", proj:"BNK-2026", tot:40, inproj:36, dev:0, warn:0, sel:false, days:[8,8,8,8,8]},
      {who:"Bruno Matos", role:"Consultant", proj:"RTL-TT", tot:38.5, inproj:34, dev:-1.5, warn:0, sel:false, days:[8,8,8,8,6.5]},
      {who:"Carla Nunes", role:"Consultant", proj:"AER-WFM", tot:40, inproj:40, dev:0, warn:0, sel:false, days:[8,8,8,8,8]},
      {who:"Diogo Sousa", role:"Junior consultant", proj:"BNK-2026", tot:37, inproj:30, dev:-3, warn:0, sel:false, days:[8,8,8,8,5]},
      {who:"Eva Lopes", role:"Architect", proj:"RTL-TT", tot:40, inproj:40, dev:0, warn:1, sel:false, note:"Pending leave request overlaps recorded hours", days:[8,8,8,8,8]},
      {who:"Filipe Reis", role:"Consultant", proj:"AER-WFM", tot:24, inproj:18, dev:-16, warn:1, sel:false, note:"Two empty working days", days:[8,8,0,8,0]}
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
    /* Never past the day's capacity - the person's daily schedule, reduced
       further by an approved absence when there is one. The field-level
       check in durCell keeps this from happening through the UI; this is
       the same rule enforced again for whatever reaches state.rows some
       other way (Quick add, the assistant, a suggestion accepted). */
    for(var a=0; a<5; a++){
      var cap = capacity(a), tot = dayTotal(a);
      if(tot === 0) continue;
      if(cap === 0 && absHours(a) > 0){
        out.push({sev:"e", day:a, conflict:a,
          txt:DAYS[a]+" has an approved "+absOn(a,"approved")[0].type.toLowerCase()+". The "+fmt(tot)+" h recorded need to move off this day."});
      } else if(tot > cap){
        out.push({sev:"e", day:a,
          txt: absHours(a) > 0
            ? DAYS[a]+" has an approved partial absence. Day capacity is "+fmt(cap)+" h and "+fmt(tot)+" h are recorded."
            : DAYS[a]+"'s capacity is "+fmt(cap)+" h; "+fmt(tot)+" h are recorded."});
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
    /* closed periods, monthly and per company */
    for(var c=0; c<7; c++){
      if(dayTotal(c) > 0 && !periodOpen(WORKDATES[c])){
        out.push({sev:"e", day:c, txt:DAYS[c]+" falls in period "+periodFor(WORKDATES[c]).ym+", closed for "+IT0001.bukrs+". Reopening is an HR action."});
      }
    }
    /* overlapping windows, only in the profile that records start and end */
    if(isClock()){
      for(var o=0; o<7; o++){
        var hits = clockOverlaps(o);
        if(hits.length){
          out.push({sev:"e", day:o, txt:DAYS[o]+" has overlapping time windows: "+fmtClock(hits[0][0].b)+" to "+fmtClock(hits[0][0].e%1440)+" and "+fmtClock(hits[0][1].b)+" to "+fmtClock(hits[0][1].e%1440)+"."});
        }
      }
      state.rows.forEach(function(r){
        for(var i=0; i<7; i++){
          var s = slot(r,i);
          if(s && (s.b === null) !== (s.e === null)){
            out.push({sev:"e", row:r.id, day:i, txt:DAYS[i]+", "+PROJECTS[r.p].code+": the window needs both a start and an end."});
          }
        }
      });
    }
    /* allowances on this employee's own sheet */
    myAllow().forEach(function(a){
      var w = wt(a.code);
      if(!w) return;
      if(w.noteLabel && !String(a.note || "").trim()){
        out.push({sev:"e", allow:a.id, txt:w.name+" on "+DAYS[a.day]+" needs "+w.noteLabel.toLowerCase()+"."});
      }
      if(!periodOpen(WORKDATES[a.day])){
        out.push({sev:"e", allow:a.id, txt:w.name+" on "+DAYS[a.day]+" falls in a closed period."});
      }
      if(w.amount && !(a.amount > 0)){
        out.push({sev:"e", allow:a.id, txt:w.name+" on "+DAYS[a.day]+" has no amount."});
      }
      if(!w.amount && !(a.qty > 0)){
        out.push({sev:"e", allow:a.id, txt:w.name+" on "+DAYS[a.day]+" has no quantity."});
      }
    });
    var pend = visibleSugs().length;
    if(pend > 0 && !state.privateMode) out.push({sev:"i", txt:pend+" suggestions still to review in the side panel."});
    return out;
  }
  function errors(){ return validate().filter(function(m){ return m.sev === "e"; }); }

  /* ---------- start and end, profile Z_BSRV ----------
     Stored per row and day as {b, e} in minutes, written to BEGUZ and ENDUZ.
     The duration is always computed and never editable in this profile, and
     the three values are all kept so nothing downstream has to recalculate. */
  function parseClock(txt){
    if(txt === null || txt === undefined) return null;
    var t = String(txt).trim();
    if(!t) return null;
    var m = t.replace(/[.hH]/g, ":").match(/^(\d{1,2})(?::(\d{1,2}))?$/);
    if(!m) return NaN;
    var h = +m[1], mi = m[2] === undefined ? 0 : +m[2];
    if(h > 23 || mi > 59) return NaN;
    return h*60 + mi;
  }
  function fmtClock(min){
    if(min === null || min === undefined) return "";
    var h = Math.floor(min/60), m = min%60;
    return (h<10?"0":"") + h + ":" + (m<10?"0":"") + m;
  }
  function slot(r, i){
    if(!r.t) r.t = [null,null,null,null,null,null,null];
    return r.t[i];
  }
  function setSlot(r, i, s){
    if(!r.t) r.t = [null,null,null,null,null,null,null];
    r.t[i] = s;
  }
  function slotHours(s){
    if(!s || s.b === null || s.e === null) return 0;
    var d = s.e - s.b;
    if(d < 0) d = profileFor(WORKDATES[0]).overnight ? d + 1440 : 0;
    return round15(d/60);
  }
  /* Recomputes every duration from the time window. Called whenever a window
     changes and once when the profile switches to Z_BSRV. */
  function syncClock(){
    state.rows.forEach(function(r){
      for(var i=0; i<7; i++){
        var s = slot(r,i);
        if(s) r.h[i] = slotHours(s);
      }
    });
  }
  /* Overlapping windows on the same day, only meaningful in Z_BSRV. */
  function clockOverlaps(day){
    var slots = [];
    state.rows.forEach(function(r){
      var s = slot(r,day);
      if(s && s.b !== null && s.e !== null) slots.push({b:s.b, e:s.e < s.b ? s.e + 1440 : s.e, p:r.p});
    });
    slots.sort(function(a,b){ return a.b - b.b; });
    var hits = [];
    for(var i=1; i<slots.length; i++){
      if(slots[i].b < slots[i-1].e) hits.push([slots[i-1], slots[i]]);
    }
    return hits;
  }

  /* The one gate a self-entry cell has to pass to stay editable: the week
     isn't submitted, its period isn't closed, and it isn't a day an approved
     absence already fills (unless it already carries a value, so an old
     entry stays visible and removable even if an absence landed on it
     afterwards). durCell and clockCell each computed this the same way. */
  function cellLocked(day, v){
    return state.submitted || !periodOpen(WORKDATES[day]) || (isBlocked(day) && !v);
  }
  function durCell(r, i, v, pr){
    var inp = document.createElement("input");
    inp.type = "text";
    inp.className = "cell" + (i>4 ? " we" : "");
    inp.id = "c-"+r.id+"-"+i;
    inp.value = v ? fmt(v) : "";
    inp.inputMode = "decimal";
    inp.setAttribute("aria-label","Duration in hours, "+pr.name+", "+DAYS[i]);
    inp.disabled = cellLocked(i, v);
    decorateCell(inp, i, v);
    inp.addEventListener("change", function(){
      var parsed = parseDur(inp.value);
      if(isNaN(parsed)){ toast("Couldn't read “"+inp.value+"”. Use 1.5 or 1:30 or 90m."); inp.value = v ? fmt(v) : ""; return; }
      var newVal = round15(parsed);
      /* Never exceed the day's capacity - the person's daily schedule,
         reduced further by an approved absence when there is one. Block
         it here, at the field, instead of only flagging it once the
         week is validated: the app should never let the limit pass. */
      var otherTotal = dayTotal(i) - (r.h[i] || 0);
      var cap = capacity(i);
      if(otherTotal + newVal > cap){
        var abs = absOn(i, "approved")[0];
        var left = Math.max(0, cap - otherTotal);
        var msg = abs
          ? DAYS[i]+" has an approved "+abs.type.toLowerCase()+"."
          : DAYS[i]+"'s capacity is "+fmt(cap)+" h.";
        toast(msg + (left > 0 ? " Only "+fmt(left)+" h available." : " No hours available on this day."));
        inp.value = v ? fmt(v) : "";
        return;
      }
      r.h[i] = newVal;
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
    return inp;
  }

  function clockCell(r, i, v, pr){
    var box = el("div","clockcell" + (i>4 ? " we" : ""), "");
    var s = slot(r,i);
    var locked = cellLocked(i, v);
    ["b","e"].forEach(function(k){
      var inp = document.createElement("input");
      inp.type = "text";
      inp.className = "tinp";
      inp.id = "c-"+r.id+"-"+i+(k === "b" ? "" : "-e");
      inp.value = s ? fmtClock(s[k]) : "";
      inp.placeholder = k === "b" ? "start" : "end";
      inp.inputMode = "numeric";
      inp.disabled = locked;
      inp.setAttribute("aria-label", (k === "b" ? "Start time, " : "End time, ") + pr.name + ", " + DAYS[i]);
      inp.addEventListener("change", function(){
        var parsed = parseClock(inp.value);
        if(isNaN(parsed)){ toast("Couldn't read “"+inp.value+"”. Use 08:00 or 8."); render(); return; }
        var cur = slot(r,i) || {b:null, e:null};
        cur[k] = parsed;
        if(cur.b === null && cur.e === null) setSlot(r,i,null); else setSlot(r,i,cur);
        syncClock();
        render();
      });
      box.appendChild(inp);
    });
    var d = el("div","cdur", v ? fmt(v) + " h" : "–");
    if(s && s.b !== null && s.e !== null && s.e < s.b) d.textContent = fmt(v) + " h +1";
    box.appendChild(d);
    decorateCell(box, i, v);
    return box;
  }

  function decorateCell(node, i, v){
    if(!periodOpen(WORKDATES[i])){
      node.classList.add("closed");
      node.title = "Period " + periodFor(WORKDATES[i]).ym + " is closed for " + IT0001.bukrs + ". Reopening is an HR action.";
    } else if(isBlocked(i)){
      node.classList.add("abs");
      node.title = "Approved " + absOn(i,"approved")[0].type.toLowerCase() + ", day not available for time entry";
    } else if(absHours(i) > 0){
      node.title = "Approved partial absence, capacity of " + fmt(capacity(i)) + " h this day";
    }
  }

  /* ---------- render: grid ---------- */
  function renderGrid(){
    var g = $("tsgrid");
    g.innerHTML = "";
    g.className = "tsgrid" + (isClock() ? " clock" : "");

    var head = document.createElement("div");
    head.className = "row head";
    head.appendChild(el("div","","Project, WBS and activity"));
    DAYS.forEach(function(d,i){
      var c = el("div", i>4?"we":"", "");
      appendDayLabel(c, i);
      var ap = absOn(i,"approved")[0], pe = absOn(i,"pending")[0];
      if(ap) c.appendChild(dayAbsBadge(ap, capacity(i) === 0 ? ap.type : "half day", capacity(i) === 0 ? " full" : ""));
      else if(pe) c.appendChild(dayAbsBadge(pe, "pending", " pend"));
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
        row.appendChild(isClock() ? clockCell(r,i,v,pr) : durCell(r,i,v,pr));
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

  /* ---------- render: monthly grid, consulting only ----------
     One row per project for the whole month; hours still live on the
     underlying week's own row (created lazily on first edit in a week
     that doesn't have one yet), read/written through the week-scoped
     helpers above so a cell always uses its own week's capacity and
     absences, never whichever week the rest of the app is pointed at. */
  function monthDayLabel(week, i){ return WEEKDAY_ABBR[i] + " " + (+datesFor(week.start)[i].slice(6,8)); }
  function dayAbsBadgeOf(week, a, label, extraClass){
    var b = el("button","dayabs" + extraClass, label);
    b.type = "button";
    b.setAttribute("aria-label", a.type + ", " + monthDayLabel(week, a.day) + ", " + ABSTATUS[a.status].toLowerCase());
    b.onmouseenter = function(){ withWeek(week, function(){ showAbsTip(a, b); }); };
    b.onmouseleave = hideAbsTip;
    b.onfocus = function(){ withWeek(week, function(){ showAbsTip(a, b); }); };
    b.onblur = hideAbsTip;
    return b;
  }
  function monthDecorateCell(node, week, i){
    var dates = datesFor(week.start);
    if(!periodOpen(dates[i])){
      node.classList.add("closed");
      node.title = "Period " + periodFor(dates[i]).ym + " is closed for " + IT0001.bukrs + ". Reopening is an HR action.";
    } else if(isBlockedOf(week, i)){
      node.classList.add("abs");
      var ap = week.absences.filter(function(a){ return a.day === i && a.status === "approved"; })[0];
      node.title = "Approved " + (ap ? ap.type.toLowerCase() : "absence") + ", day not available for time entry";
    } else if(absHoursOf(week, i) > 0){
      node.title = "Approved partial absence, capacity of " + fmt(capacityOf(week,i)) + " h this day";
    }
  }
  function monthDurCell(monthRow, week, i, pr){
    var existing = monthRowIn(week, monthRow.p);
    var v = existing ? (existing.h[i] || 0) : 0;
    var inp = document.createElement("input");
    inp.type = "text";
    inp.className = "cell";
    inp.value = v ? fmt(v) : "";
    inp.inputMode = "decimal";
    inp.setAttribute("aria-label","Duration in hours, "+pr.name+", "+monthDayLabel(week,i));
    inp.disabled = cellLockedOf(week, i, v);
    monthDecorateCell(inp, week, i);
    inp.addEventListener("change", function(){
      var parsed = parseDur(inp.value);
      if(isNaN(parsed)){ toast("Couldn't read “"+inp.value+"”. Use 1.5 or 1:30 or 90m."); inp.value = v ? fmt(v) : ""; return; }
      var newVal = round15(parsed);
      var row0 = monthRowIn(week, monthRow.p);
      var otherTotal = dayTotalOf(week, i) - (row0 ? (row0.h[i]||0) : 0);
      var cap = capacityOf(week, i);
      if(otherTotal + newVal > cap){
        var abs = week.absences.filter(function(a){ return a.day === i && a.status === "approved"; })[0];
        var left = Math.max(0, cap - otherTotal);
        var dayLabel = monthDayLabel(week, i);
        var msg = abs ? dayLabel+" has an approved "+abs.type.toLowerCase()+"." : dayLabel+"'s capacity is "+fmt(cap)+" h.";
        toast(msg + (left > 0 ? " Only "+fmt(left)+" h available." : " No hours available on this day."));
        inp.value = v ? fmt(v) : "";
        return;
      }
      var row = monthRowIn(week, monthRow.p);
      if(!row){
        row = {id:nextId++, p:monthRow.p, desc:monthRow.desc || "", h:[0,0,0,0,0,0,0], origin:"Manual"};
        week.rows.push(row);
      }
      row.h[i] = newVal;
      render();
    });
    return inp;
  }
  function renderMonthGrid(){
    var g = $("tsgrid");
    g.innerHTML = "";
    g.className = "tsgrid month";
    var dates = activeMonthDates();
    var weeks = touchedWeeksFor(dates);
    var dayCols = dates.length;
    var gridCols = "minmax(230px,1fr) repeat(" + dayCols + ",50px) 70px 34px";
    g.style.minWidth = (230 + dayCols*50 + 70 + 34) + "px";

    var head = document.createElement("div");
    head.className = "row head";
    head.style.gridTemplateColumns = gridCols;
    head.appendChild(el("div","","Project, WBS and activity"));
    dates.forEach(function(dateISO){
      var wd = weekDayFor(dateISO);
      var c = el("div", wd.day > 4 ? "we" : "", "");
      c.appendChild(el("span","dname", WEEKDAY_ABBR[wd.day]));
      c.appendChild(el("span","dnum", "" + (+dateISO.slice(6,8))));
      var ap = wd.week.absences.filter(function(a){ return a.day===wd.day && a.status==="approved"; })[0];
      var pe = wd.week.absences.filter(function(a){ return a.day===wd.day && a.status==="pending"; })[0];
      if(ap) c.appendChild(dayAbsBadgeOf(wd.week, ap, capacityOf(wd.week,wd.day)===0 ? ap.type : "half day", capacityOf(wd.week,wd.day)===0 ? " full" : ""));
      else if(pe) c.appendChild(dayAbsBadgeOf(wd.week, pe, "pending", " pend"));
      head.appendChild(c);
    });
    head.appendChild(el("div","","Total"));
    head.appendChild(el("div","",""));
    g.appendChild(head);

    /* the week-divider row groups consecutive dates that belong to the
       same underlying week - not fixed at 5 or 7 wide, since a boundary
       week only contributes however many of its days fall in this month */
    var sub = document.createElement("div");
    sub.className = "row monthsub";
    sub.style.gridTemplateColumns = gridCols;
    sub.appendChild(el("div","",""));
    var di = 0;
    while(di < dates.length){
      var w0 = weekDayFor(dates[di]).week;
      var span = 0;
      while(di+span < dates.length && weekDayFor(dates[di+span]).week === w0) span++;
      var label = el("div","monthweeklabel","Week "+w0.num);
      label.style.gridColumn = "span " + span;
      sub.appendChild(label);
      di += span;
    }
    sub.appendChild(el("div","",""));
    sub.appendChild(el("div","",""));
    g.appendChild(sub);

    var monthRows = monthProjectRows(weeks);
    var allSubmitted = weeks.every(function(w){ return w.submitted; });

    if(monthRows.length === 0){
      var e = document.createElement("div");
      e.className = "empty";
      e.innerHTML = '<p><strong>No hours recorded this month yet.</strong> Start with the shortest path.</p>';
      var acts = el("div","acts","");
      acts.appendChild(btn("Add the first project","btn", addMonthRow));
      e.appendChild(acts);
      g.appendChild(e);
    }

    monthRows.forEach(function(monthRow){
      var pr = PROJECTS[monthRow.p];
      var row = document.createElement("div");
      row.className = "row" + (allSubmitted ? " locked" : "");
      row.style.gridTemplateColumns = gridCols;

      var meta = el("div","rowmeta","");
      var p = el("div","p","");
      p.appendChild(el("span","", pr.name));
      var c = document.createElement("code"); c.textContent = pr.wbs || pr.sap.rkostl; p.appendChild(c);
      p.appendChild(el("span","bill" + (pr.proj?"":" no"), pr.proj ? "PEP" : "INTERNAL"));
      meta.appendChild(p);
      var descInp = document.createElement("input");
      descInp.type = "text";
      descInp.className = "monthdesc";
      descInp.placeholder = pr.proj ? "Description (required once hours are logged)" : "Description";
      descInp.value = monthRow.desc || "";
      descInp.disabled = allSubmitted;
      descInp.setAttribute("aria-label","Description, "+pr.name);
      descInp.addEventListener("change", function(){
        var val = descInp.value;
        weeks.forEach(function(w){ var r = monthRowIn(w, monthRow.p); if(r) r.desc = val; });
        render();
      });
      meta.appendChild(descInp);
      row.appendChild(meta);

      var rowTot = 0;
      dates.forEach(function(dateISO){
        var wd = weekDayFor(dateISO);
        var existing = monthRowIn(wd.week, monthRow.p);
        rowTot += existing ? (existing.h[wd.day]||0) : 0;
        row.appendChild(monthDurCell(monthRow, wd.week, wd.day, pr));
      });

      row.appendChild(el("div","rowtot", rowTot ? fmt(rowTot) : "–"));
      var act = el("div","rowact","");
      var rm = btn("×","", function(){
        var removed = [];
        weeks.forEach(function(w){
          var r = monthRowIn(w, monthRow.p);
          if(r){ w.rows = w.rows.filter(function(x){ return x.id !== r.id; }); removed.push({week:w, row:r}); }
        });
        render();
        toast("Row removed.", "Undo", function(){
          removed.forEach(function(item){ item.week.rows.push(item.row); });
          render();
        });
      });
      rm.setAttribute("aria-label","Remove row "+pr.name);
      rm.disabled = allSubmitted;
      act.appendChild(rm);
      row.appendChild(act);
      g.appendChild(row);
    });

    if(monthRows.length){
      var tr = document.createElement("div");
      tr.className = "row totals";
      tr.style.gridTemplateColumns = gridCols;
      tr.appendChild(el("div","rowmeta","Total per day"));
      dates.forEach(function(dateISO){
        var wd = weekDayFor(dateISO);
        var v = dayTotalOf(wd.week, wd.day), cap = capacityOf(wd.week, wd.day);
        var cls = "t";
        if(v > 24 || v > cap) cls += " over";
        else if(v === 0 && cap > 0) cls += " zero";
        else if(cap === 0) cls += " off";
        tr.appendChild(el("div", cls, cap === 0 && !v ? "–" : (v ? fmt(v) : "0.0")));
      });
      tr.appendChild(el("div","t", fmt(monthTotalHours(dates))));
      tr.appendChild(el("div","",""));
      g.appendChild(tr);
    }
  }
  function addMonthRow(){
    var weeks = activeMonthWeeks();
    if(weeks.every(function(w){ return w.submitted; })) return;
    var used = {};
    weeks.forEach(function(w){ w.rows.forEach(function(r){ used[r.p] = true; }); });
    var p = 0;
    for(var i=0; i<PROJECTS.length; i++){ if(!used[i]){ p = i; break; } }
    var target = weeks.filter(function(w){ return !w.submitted; })[0] || weeks[0];
    target.rows.push({id:nextId++, p:p, desc:"", h:[0,0,0,0,0,0,0], origin:"Manual"});
    render();
    var descs = document.querySelectorAll(".monthdesc");
    var last = descs[descs.length-1];
    if(last) last.focus();
  }
  function monthList(){
    var seen = {}, out = [];
    WEEKS_PT01.forEach(function(w){ var k = monthKeyOf(w); if(!seen[k]){ seen[k] = 1; out.push(k); } });
    return out;
  }
  function changeMonth(delta){
    var months = monthList();
    var mi = months.indexOf(monthKeyOf(WEEKS[weekIdx]));
    var nextMi = mi + delta;
    if(nextMi < 0 || nextMi >= months.length){
      toast(delta < 0 ? "No earlier sample months." : "No later sample months.");
      return;
    }
    var target = WEEKS.filter(function(w){ return monthKeyOf(w) === months[nextMi]; })[0];
    saveCurrentWeek();
    loadWeek(WEEKS.indexOf(target));
    render();
  }
  /* Only Copy previous week and Apply template are hidden for consulting's
     monthly view - "previous week" and a per-week template don't carry a
     clear meaning once the whole month is already on screen. Calendar,
     Quick add, Suggestions and Allowances stay available and keep working
     exactly as before, against the one week the app is currently pointed
     at (WEEKS[weekIdx]) - the same week the month grid highlights first. */
  function applyMonthlyUI(){
    var monthly = isMonthly();
    if($("copyWeek")) $("copyWeek").hidden = monthly;
    if($("tplBtn")) $("tplBtn").hidden = monthly;
  }

  /* ---------- render: calendar ---------- */
  /* Read-only overview, for consulting's monthly view: every week's day
     laid out side by side on the same hour axis. Editing still happens on
     the Grid - the blocks here aren't clickable and there's no "+ log
     time", both of which would otherwise need to know which week a click
     landed in, the same problem the Grid's own month cells solve with the
     *Of() helpers; not worth it for a read-only summary. */
  function renderCalMonth(){
    var cal = $("cal");
    cal.innerHTML = "";
    var dates = activeMonthDates();
    cal.className = "cal month";
    cal.style.gridTemplateColumns = "52px repeat(" + dates.length + ",minmax(90px,1fr))";
    cal.style.minWidth = (52 + dates.length*90) + "px";

    cal.appendChild(el("div","ch","Time"));
    dates.forEach(function(dateISO){
      var wd = weekDayFor(dateISO);
      cal.appendChild(el("div","ch", monthDayLabel(wd.week, wd.day)));
    });

    var hours = el("div","hours","");
    for(var h=9; h<19; h++){ hours.appendChild(el("span","", h+":00")); }
    cal.appendChild(hours);

    dates.forEach(function(dateISO){
      var wd = weekDayFor(dateISO), w = wd.week, d = wd.day;
      var col = el("div","col","");
      w.absences.filter(function(a){ return a.day === d; }).forEach(function(a){
        var ab = el("div","blk abs" + (a.status === "pending" ? " pend" : ""), "");
        ab.style.minHeight = Math.max(30, a.hours*26) + "px";
        ab.appendChild(el("b","", fmt(a.hours)+" h"));
        ab.appendChild(document.createTextNode(a.type + " · " + ABSTATUS[a.status]));
        ab.title = a.src + ", AWART " + a.awart;
        col.appendChild(ab);
      });
      var any = false;
      w.rows.forEach(function(r){
        var v = r.h[d];
        if(!v) return;
        any = true;
        var pr = PROJECTS[r.p];
        var b = el("div","blk" + (pr.proj ? "" : " nb"), "");
        b.style.minHeight = Math.max(30, v*26) + "px";
        var s = slot(r,d);
        b.appendChild(el("b","", (isClock() && s && s.b!==null && s.e!==null) ? (fmtClock(s.b)+"–"+fmtClock(s.e%1440)) : fmt(v)+" h"));
        b.appendChild(document.createTextNode(pr.code + " · " + (r.desc || pr.act)));
        col.appendChild(b);
      });
      if(isBlockedOf(w,d) && !any){
        col.appendChild(el("div","calfree off","day not available"));
      }
      cal.appendChild(col);
    });
  }
  function renderCal(){
    if(isMonthly()) return renderCalMonth();
    var cal = $("cal");
    cal.innerHTML = "";
    cal.className = "cal";
    cal.style.gridTemplateColumns = "";
    cal.style.minWidth = "";
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
        ab.appendChild(el("b","", fmt(a.hours)+" h"));
        ab.appendChild(document.createTextNode(a.type + " · " + ABSTATUS[a.status]));
        ab.title = a.src + ", AWART " + a.awart;
        col.appendChild(ab);
      });
      /* r.desc is free text the person types in Quick Add or the detail
         dialog: built with textContent/createTextNode, never innerHTML, so
         something like "<img onerror=...>" in a description shows up as
         literal text instead of running. */
      state.rows.forEach(function(r){
        var v = r.h[d];
        if(!v) return;
        var pr = PROJECTS[r.p];
        var b = document.createElement("button");
        b.className = "blk" + (pr.proj ? "" : " nb");
        b.style.minHeight = Math.max(30, v*26) + "px";
        var s = slot(r,d);
        b.appendChild(el("b","", (isClock() && s && s.b!==null && s.e!==null) ? (fmtClock(s.b)+"–"+fmtClock(s.e%1440)) : fmt(v)+" h"));
        b.appendChild(document.createTextNode(pr.code + " · " + (r.desc || pr.act)));
        b.onclick = (function(day){ return function(){ openDetail(r, day); }; })(d);
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

    /* Collapsed when there's nothing to review, open when there is —
       unless the person has already toggled it themselves this session,
       which always wins over the automatic guess. */
    var autoOpen = !state.privateMode && vis.length > 0;
    setPanelOpen("sugPanel", "sugTog", state.sugManualOpen === null ? autoOpen : state.sugManualOpen);

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
  /* Month messages skip the one-click "resolve"/"go to day" actions the
     weekly view offers - those assume state.rows is the row they'd act
     on, which isn't reliably true once a message can belong to any of
     several weeks. Each line names its week instead. */
  function renderMsgsMonth(){
    var dates = activeMonthDates();
    var weeks = touchedWeeksFor(dates);
    var list = [];
    weeks.forEach(function(w){
      withWeek(w, function(){
        validate().forEach(function(m){
          if(typeof m.day === "number" && dates.indexOf(datesFor(w.start)[m.day]) === -1) return;
          list.push({sev:m.sev, txt:"Week "+w.num+": "+m.txt});
        });
      });
    });
    var box = $("msgs");
    box.innerHTML = "";
    $("msgPanel").hidden = list.length === 0;
    $("msgCount").textContent = list.length + (list.length === 1 ? " message" : " messages");
    var names = {e:"ERROR", w:"WARNING", i:"INFO"};
    list.forEach(function(m){
      var row = el("div","msg "+m.sev,"");
      row.appendChild(el("span","ic", names[m.sev]));
      row.appendChild(el("span","", m.txt));
      box.appendChild(row);
    });
  }
  function renderMsgs(){
    if(isMonthly()) return renderMsgsMonth();
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
  function renderKpisMonth(){
    var dates = activeMonthDates();
    var weeks = touchedWeeksFor(dates);
    var ym = monthKeyOf(WEEKS[weekIdx]);
    var y = ym.slice(0,4), mIdx = +ym.slice(4,6) - 1;
    /* A clean month selector, not a week one - the week numbers already
       label their own columns in the grid below, repeating them here read
       as if this picked a week, not a month. */
    var monthName = MONTHS_NLP[mIdx].charAt(0).toUpperCase() + MONTHS_NLP[mIdx].slice(1);
    var label = monthName + " " + y;
    $("weekLabel").textContent = label;
    var months = monthList();
    var mi = months.indexOf(ym);
    $("prevW").disabled = mi <= 0;
    $("nextW").disabled = mi >= months.length - 1;
    /* Team keeps its own week-by-week navigator even when My week steps by
       month for consulting - a leader stepping through the team's log
       still needs single weeks, so this mirrors the *week*, not the month. */
    if($("weekLabel2")) $("weekLabel2").textContent = weekLabelFor(WORKDATES, WEEKS[weekIdx].num);
    if($("prevW2")) $("prevW2").disabled = weekIdx === 0;
    if($("nextW2")) $("nextW2").disabled = weekIdx === WEEKS.length - 1;

    var tot = monthTotalHours(dates), expect = monthCapacityTotal(dates);
    var proj = dates.reduce(function(a,d){
      var wd = weekDayFor(d);
      return a + (wd ? wd.week.rows.reduce(function(x,r){ return x + (PROJECTS[r.p].proj ? (r.h[wd.day]||0) : 0); }, 0) : 0);
    }, 0);
    $("kTot").innerHTML = fmt(tot) + "<small> / " + fmt(expect) + " h</small>";
    var pct = expect ? Math.min(100, tot/expect*100) : 0;
    var bar = $("kBar");
    bar.style.width = pct + "%";
    bar.className = tot >= expect ? "ok" : (pct < 80 ? "low" : "");
    $("kProj").innerHTML = fmt(proj) + "<small> h</small>";
    $("kProjBar").style.width = (tot ? proj/tot*100 : 0) + "%";

    var absW = 0, zeros = 0;
    dates.forEach(function(d){
      var wd = weekDayFor(d);
      if(!wd || wd.day > 4) return;
      absW += absHoursOf(wd.week, wd.day);
      if(capacityOf(wd.week, wd.day) > 0 && dayTotalOf(wd.week, wd.day) === 0) zeros++;
    });
    var reduced = dailyCapFor() !== DAYCAP;
    if($("kExtra")) $("kExtra").textContent = weeks.length + (weeks.length===1?" week":" weeks") + " this month · "
      + (reduced ? "Reduced schedule, " + fmt(dailyCapFor()) + " h/day · " : "")
      + fmt(absW) + " h absences deducted · " + zeros + (zeros === 1 ? " empty working day" : " empty working days");

    var errs = monthErrors(dates).length;
    $("kVal").textContent = errs ? (errs + (errs===1 ? " error" : " errors")) : "No errors";
    $("kVal").style.color = errs ? "var(--crit)" : "var(--good)";
    var allSubmitted = weeks.every(function(w){ return w.submitted; });
    $("submitBtn").disabled = allSubmitted || errs > 0 || tot === 0;
    $("submitBtn").textContent = allSubmitted ? "Month submitted" : "Submit month";
    var chip = $("stateChip");
    chip.textContent = allSubmitted ? "In approval" : "Draft";
    chip.className = allSubmitted ? "chip blue" : "chip grey";
    var sc = $("sugChip"), nv = visibleSugs().length;
    sc.hidden = state.privateMode || nv === 0;
    sc.textContent = nv + (nv === 1 ? " suggestion to review" : " suggestions to review");
    var pf = profileFor(WORKDATES[0]);
    var pc = $("profChip");
    if(pc){
      pc.textContent = pf.code;
      pc.title = companyName(IT0001.bukrs) + " · " + pf.fields;
      pc.className = pf.clock ? "chip blue" : "chip grey";
    }
    var co = $("coSel");
    if(co && co.value !== IT0001.bukrs) co.value = IT0001.bukrs;
  }
  function renderKpis(){
    if(isMonthly()) return renderKpisMonth();
    $("weekLabel").textContent = weekLabelFor(WORKDATES, WEEKS[weekIdx].num);
    $("prevW").disabled = weekIdx === 0;
    $("nextW").disabled = weekIdx === WEEKS.length - 1;
    /* the team screen has its own week navigator, kept in sync with this one */
    if($("weekLabel2")) $("weekLabel2").textContent = weekLabelFor(WORKDATES, WEEKS[weekIdx].num);
    if($("prevW2")) $("prevW2").disabled = weekIdx === 0;
    if($("nextW2")) $("nextW2").disabled = weekIdx === WEEKS.length - 1;
    var tot = weekTotal(), proj = projTotal(), expect = weekCapacity();
    $("kTot").innerHTML = fmt(tot) + "<small> / " + fmt(expect) + " h</small>";
    var pct = expect ? Math.min(100, tot/expect*100) : 0;
    var bar = $("kBar");
    bar.style.width = pct + "%";
    bar.className = tot >= expect ? "ok" : (pct < 80 ? "low" : "");
    var absW = 0;
    for(var a=0; a<5; a++) absW += absHours(a);
    $("kProj").innerHTML = fmt(proj) + "<small> h</small>";
    $("kProjBar").style.width = (tot ? proj/tot*100 : 0) + "%";
    var zeros = 0;
    for(var i=0; i<5; i++) if(capacity(i) > 0 && dayTotal(i) === 0) zeros++;
    var reduced = dailyCapFor() !== DAYCAP;
    if($("kExtra")) $("kExtra").textContent = (reduced ? "Reduced schedule, " + fmt(dailyCapFor()) + " h/day · " : "")
      + fmt(absW) + " h absences deducted · " + zeros + (zeros === 1 ? " empty working day" : " empty working days");
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
    var pf = profileFor(WORKDATES[0]);
    var pc = $("profChip");
    if(pc){
      pc.textContent = pf.code;
      pc.title = companyName(IT0001.bukrs) + " · " + pf.fields;
      pc.className = pf.clock ? "chip blue" : "chip grey";
    }
    var co = $("coSel");
    if(co && co.value !== IT0001.bukrs) co.value = IT0001.bukrs;
  }

  function render(){
    applyMonthlyUI();
    if(isMonthly()){ renderMonthGrid(); } else { renderGrid(); }
    renderCal(); renderSugs(); renderAllow();
    renderMsgs(); renderKpis(); renderApprovals(); renderTeam(); renderCats();
  }

  /* ---------- absences: a badge on the grid's day header, detail on hover ----------
     Used to be a permanent side panel listing every absence, open or not.
     The grid already marks which days are affected; hovering (or focusing,
     for keyboard use) the badge is enough to see the full card, including
     the pending ones' approval action, without reserving screen space for
     it when nobody's looking. */
  var absTipTimer = null;
  function dayAbsBadge(a, label, extraClass){
    var b = el("button","dayabs" + extraClass, label);
    b.type = "button";
    b.setAttribute("aria-label", a.type + ", " + DAYS[a.day] + ", " + ABSTATUS[a.status].toLowerCase());
    b.onmouseenter = function(){ showAbsTip(a, b); };
    b.onmouseleave = hideAbsTip;
    b.onfocus = function(){ showAbsTip(a, b); };
    b.onblur = hideAbsTip;
    return b;
  }
  function showAbsTip(a, anchorEl){
    clearTimeout(absTipTimer);
    var tip = $("absTip");
    if(!tip) return;
    tip.innerHTML = "";
    var c = el("div","abscard" + (a.status === "pending" ? " pend" : ""), "");
    var h = el("div","h","");
    h.appendChild(el("b","", a.type));
    h.appendChild(el("span","chip " + (a.status === "approved" ? "grey" : "amber"), ABSTATUS[a.status]));
    c.appendChild(h);
    c.appendChild(el("div","why", DAYS[a.day] + " · " + fmt(a.hours) + " h · AWART " + a.awart));
    c.appendChild(el("div","why", a.src + " · Leave Request, read-only"));
    if(a.status === "pending"){
      var acts = el("div","acts","");
      acts.appendChild(btn("Simulate approval","btn sm", function(){ hideAbsTipNow(); approveAbsence(a); }));
      c.appendChild(acts);
    }
    tip.appendChild(c);
    tip.hidden = false;
    var r = anchorEl.getBoundingClientRect();
    tip.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 268)) + "px";
    tip.style.top = (r.bottom + 6) + "px";
    tip.onmouseenter = function(){ clearTimeout(absTipTimer); };
    tip.onmouseleave = hideAbsTip;
  }
  function hideAbsTip(){ absTipTimer = setTimeout(hideAbsTipNow, 150); }
  function hideAbsTipNow(){ clearTimeout(absTipTimer); var t = $("absTip"); if(t) t.hidden = true; }
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

  /* ---------- allowances, wage types against a project ----------
     Quantity and unit, never a value, except the bonus, which the project
     owner creates with an amount. An allowance can exist on a day with no
     hours, so nothing here depends on the grid. */
  var alEdit = null;
  function myAllow(){
    return state.allow.filter(function(a){ return (a.onBehalf || IT0001.pernr) === IT0001.pernr; });
  }
  function allowLabel(a){
    var w = wt(a.code);
    return w.amount ? fmt(a.amount) + " EUR" : fmt(a.qty) + " " + w.unit;
  }
  function renderAllow(){
    var box = $("allowList");
    if(!box) return;
    box.innerHTML = "";
    var mine = myAllow();
    $("allowCount").textContent = mine.length + (mine.length === 1 ? " allowance" : " allowances");
    if(!mine.length){
      box.appendChild(el("div","paused","No allowances recorded this week. Per diems, kilometres and shift allowances are recorded here, against a project and a date."));
      return;
    }
    mine.slice().sort(function(x,y){ return x.day - y.day; }).forEach(function(a){
      var w = wt(a.code);
      var c = el("div","abscard" + (w.amount ? " bonus" : ""), "");
      var h = el("div","h","");
      h.appendChild(el("b","", w.name));
      h.appendChild(el("span","chip " + (w.amount ? "green" : "grey"), allowLabel(a)));
      c.appendChild(h);
      c.appendChild(el("div","why", DAYS[a.day] + " · " + PROJECTS[a.p].code + " · wage type " + w.lgart));
      if(a.note) c.appendChild(el("div","why", a.note));
      if(a.by !== a.onBehalf) c.appendChild(el("div","why", "Recorded by " + a.byName + ", on behalf of the employee"));
      if(w.amount) c.appendChild(el("div","why", "Amount goes to CATSAMOUNT, native CATSDB field. ANZHL goes to CATS as 1."));
      var acts = el("div","acts","");
      var rm = btn("Remove","btn sm", function(){
        if(!allowEditable(a)) return;
        state.allow = state.allow.filter(function(x){ return x.id !== a.id; });
        render(); toast(w.name + " removed.", "Undo", function(){ state.allow.push(a); render(); });
      });
      rm.disabled = !allowEditable(a);
      if(w.amount) rm.title = "The bonus is removed by the project owner, on the team screen.";
      acts.appendChild(rm);
      c.appendChild(acts);
      box.appendChild(c);
    });
  }
  function allowEditable(a){
    var w = wt(a.code);
    if(state.submitted) return false;
    if(!periodOpen(WORKDATES[a.day])) return false;
    return !w.amount;
  }
  function openAllow(){
    if(state.submitted){ toast("The week is submitted, allowances can't be changed."); return; }
    if(weekPeriodClosed()){ toast("This week falls in a closed period."); return; }
    alEdit = {id:"al"+(nextId++), day:0, p:state.rows.length ? state.rows[0].p : 0, code:wtFor()[0].code, qty:1, amount:0, note:"", by:IT0001.pernr, onBehalf:IT0001.pernr};
    var sel = $("alCode");
    sel.innerHTML = "";
    wtFor().filter(function(w){ return w.selfEntry; }).forEach(function(w){
      var o = document.createElement("option");
      o.value = w.code; o.textContent = w.name + " (" + w.lgart + ")";
      sel.appendChild(o);
    });
    alEdit.code = sel.value;
    var pj = $("alProj");
    pj.innerHTML = "";
    PROJECTS.forEach(function(p,i){
      var o = document.createElement("option");
      o.value = String(i); o.textContent = p.code + " · " + p.name;
      pj.appendChild(o);
    });
    pj.value = String(alEdit.p);
    var dy = $("alDay");
    dy.innerHTML = "";
    DAYS.forEach(function(d,i){
      var o = document.createElement("option");
      o.value = String(i); o.textContent = d + (periodOpen(WORKDATES[i]) ? "" : " (period closed)");
      o.disabled = !periodOpen(WORKDATES[i]);
      dy.appendChild(o);
    });
    dy.value = "0";
    syncAllowForm();
    $("dlgAllow").showModal();
  }
  function syncAllowForm(){
    var w = wt($("alCode").value);
    $("alQty").value = "1";
    $("alUnit").textContent = w.unit;
    $("alNoteWrap").hidden = !w.noteLabel;
    $("alNoteLbl").textContent = w.noteLabel || "Note";
    $("alProjWrap").hidden = !w.needProj;
    $("alHint").textContent = "Wage type " + w.lgart + ", quantity in ANZHL, unit " + w.unit + ". No value is calculated here, payroll values it.";
  }
  function saveAllow(){
    var w = wt($("alCode").value);
    var qty = parseDur($("alQty").value);
    if(isNaN(qty) || qty <= 0){ toast("The quantity needs to be a number above zero."); return; }
    state.allow.push({
      id: alEdit.id,
      day: +$("alDay").value,
      p: w.needProj ? +$("alProj").value : 3,
      code: w.code,
      qty: qty,
      amount: 0,
      note: $("alNote").value.trim(),
      by: IT0001.pernr,
      onBehalf: IT0001.pernr,
      byName: "self"
    });
    render();
    toast(w.name + " recorded on " + DAYS[+$("alDay").value] + ".");
  }

  /* ---------- CATS mapping screen ---------- */
  var MAP = [
    ["Employee recording the time","Personnel number","PERNR","cats",""],
    ["Day column in the grid","Work date","WORKDATE","cats","One entry per day, never aggregated to the week"],
    ["Cell value","Recorded hours","CATSHOURS","cats","Unit in UNIT, usually H"],
    ["Start and end, profile Z_BSRV","Time window","BEGUZ, ENDUZ","cats","Standard CATSDB fields, shown or hidden by the data entry profile, never by the application"],
    ["Company of the employee","Organizational assignment","IT0001, field BUKRS","cats","Decides the data entry profile through ZTIME_COMPANY_CFG, read at the date of the entry"],
    ["Data entry profile in force","CATS profile","customizing, Z_CONS or Z_BSRV","cats","Z_CONS records duration only, Z_BSRV records start and end with the duration computed"],
    ["Allowance recorded against a project","Wage type","LGART","cats","Has to exist in T512Z and be authorised in the profile"],
    ["Allowance quantity","Number, with unit","ANZHL, ZEINH","cats","Days, kilometres. The bonus goes in with ANZHL 1"],
    ["Bonus amount","Amount","CATSAMOUNT","cats","Native CATSDB field, CURR 13.2. Confirm with the client whether the standard CAT6 transfer maps it to IT2010 BETRG, or whether that needs configuring"],
    ["Transfer to payroll","Standard transfer","CAT6 to IT2010","cats","No bespoke interface. CAT5 and CAT7 cover PS and CO"],
    ["Recorded on behalf of someone","No equivalent","ON_BEHALF_OF","btp","Mass entry. The submitting user still lands in ERNAM, by standard behaviour"],
    ["Period open or closed","No equivalent","ZTIME_PERIOD_CTRL","btp","Monthly, per company. Reopening is an HR action and is recorded"],
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
    var clock = isClock();
    state.rows.forEach(function(r){
      var pr = PROJECTS[r.p];
      r.h.forEach(function(v,i){
        if(!v) return;
        var s = clock ? slot(r,i) : null;
        recs.push({
          PERNR: PERNR,
          WORKDATE: WORKDATES[i],
          CATSHOURS: fmt(v),
          UNIT: "H",
          BEGUZ: s && s.b !== null ? fmtClock(s.b) : "",
          ENDUZ: s && s.e !== null ? fmtClock(s.e) : "",
          LGART: "",
          ANZHL: "",
          CATSAMOUNT: "",
          LSTAR: pr.sap.lstar,
          RPROJ: pr.sap.rproj || "",
          SKOSTL: pr.sap.skostl,
          RKOSTL: pr.sap.rkostl || "",
          LTXA1: (r.desc || pr.act).slice(0,40),
          STATUS: status
        });
      });
    });
    /* Allowances are CATS records too, with a wage type instead of hours. */
    state.allow.forEach(function(a){
      var w = wt(a.code), pr = PROJECTS[a.p];
      recs.push({
        PERNR: a.onBehalf || PERNR,
        WORKDATE: WORKDATES[a.day],
        CATSHOURS: "",
        UNIT: w.amount ? "" : w.unit.toUpperCase().slice(0,3),
        BEGUZ: "",
        ENDUZ: "",
        LGART: w.lgart,
        ANZHL: w.amount ? "1.0" : fmt(a.qty),
        CATSAMOUNT: w.amount ? fmt(a.amount) : "",
        LSTAR: pr.sap.lstar,
        RPROJ: pr.sap.rproj || "",
        SKOSTL: pr.sap.skostl,
        RKOSTL: pr.sap.rkostl || "",
        LTXA1: (a.note || w.name).slice(0,40),
        STATUS: status
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
      ["PERNR","WORKDATE","CATSHOURS","BEGUZ","ENDUZ","LGART","ANZHL","CATSAMOUNT","LSTAR","RPROJ","LTXA1","STATUS"].forEach(function(k){
        var td = td2(rec[k] || "–");
        if(k !== "LTXA1") td.className = "f";
        if(k === "LGART" && rec[k]) td.className = "f wt";
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    if(!recs.length){
      var tr = document.createElement("tr");
      var td = document.createElement("td");
      td.colSpan = 12; td.style.color = "var(--ink-3)";
      td.textContent = "No hours and no allowances this week, so there are no records to generate.";
      tr.appendChild(td); body.appendChild(tr);
    }
    $("catsCount").textContent = recs.length + (recs.length === 1 ? " record generated" : " records generated");
    $("catsPayload").textContent =
      "// Integration with CATS is BAPI only: BAPI_CATIMESHEETMGR_INSERT / _CHANGE / _DELETE,\n" +
      "// with BAPI_TRANSACTION_COMMIT. No OData service, no WorkforceTimesheetService,\n" +
      "// whether the target is cloud or on-premise\n\n" +
      JSON.stringify({
        requestId: "ts-2026-W" + WEEKS[weekIdx].num + "-" + PERNR,
        bukrs: IT0001.bukrs,
        profile: profileFor(WORKDATES[0]).code,
        period: {ym: periodFor(WORKDATES[0]).ym, open: periodOpen(WORKDATES[0])},
        release: state.submitted,
        deviationJustification: state.deviationNote || null,
        records: recs,
        note: "CATSAMOUNT is a native CATSDB field (CURR 13,2), used above for the bonus. Confirm with the client whether the standard CAT6 transfer already maps it to IT2010 BETRG, or whether that mapping needs configuring, and which field carries the currency key alongside it",
        btpOnly: {
          comment: "stays in the experience layer, never enters CATSDB",
          onBehalfOf: massLogThisWeek().slice(-8).map(function(e){
            return {pernr: e.pernr, workdate: e.date, createdBy: e.createdBy, onBehalfOf: e.onBehalf};
          }),
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


  /* ---------- team screen, mass entry ----------
     The leader fills a grid of people by days, reviews it, and saves. The save
     is partial on purpose: rows that fail validation stay on screen with their
     reason, the rest are written. Cancelling ten rows because of one approved
     absence is the fastest way to make people stop using this screen. */
  function stagedOf(pernr){
    if(!state.staged[pernr]) state.staged[pernr] = {sel:false, h:[0,0,0,0,0,0,0], t:[null,null,null,null,null,null,null], err:""};
    if(!state.staged[pernr].t) state.staged[pernr].t = [null,null,null,null,null,null,null];
    return state.staged[pernr];
  }
  function memberBlocked(m, day){ return !!m.abs[day]; }
  function massProject(){ return +($("mProj") ? $("mProj").value : 0); }

  /* ---------- already recorded, read-only ----------
     A second grid, next to the editable one: what each person already has
     this week, so the leader can see day load before staging more, rather
     than piecing it together from the log on the right. Combines the sample
     "already" hours with whatever is staged but not yet saved, so it updates
     live as the leader fills the grid below. */
  function renderAlreadyGrid(members){
    var wrap = $("alreadyGrid");
    if(!wrap) return;
    wrap.innerHTML = "";
    wrap.className = "tsgrid team readonly";

    var head = document.createElement("div");
    head.className = "row head";
    head.appendChild(el("div","","Employee"));
    DAYS.forEach(function(d,i){ var c = el("div", i>4?"we":"", ""); appendDayLabel(c, i); head.appendChild(c); });
    head.appendChild(el("div","","Total"));
    head.appendChild(el("div","",""));
    wrap.appendChild(head);

    members.forEach(function(m){
      var st = stagedOf(m.pernr);
      var already = alreadyHoursFor(m, WEEKS[weekIdx].num);
      var row = document.createElement("div");
      row.className = "row";
      row.appendChild(el("div","rowmeta", m.name));
      var rowTotal = 0;
      already.forEach(function(v,i){
        var total = v + (st.h[i] || 0);
        rowTotal += total;
        var cls = "already-cell" + (i>4 ? " we" : "");
        if(total > 8) cls += " over";
        else if(total >= 8) cls += " full";
        if(memberBlocked(m,i)) cls += " abs";
        var cell = el("div", cls, total ? fmt(total) : "–");
        if(memberBlocked(m,i)) cell.title = "Approved " + m.abs[i].toLowerCase();
        else if(st.h[i]) cell.title = fmt(v) + " h already · " + fmt(st.h[i]) + " h staged now";
        row.appendChild(cell);
      });
      row.appendChild(el("div","rowtot", rowTotal ? fmt(rowTotal) : "–"));
      row.appendChild(el("div","",""));
      wrap.appendChild(row);
    });
  }

  /* One or more allowance lines for a single person/day cell, collapsed to
     what fits a grid cell (total quantity, or a count when the lines don't
     share a unit) with the full breakdown left for the title tooltip. Used
     both for what's staged and for what's already saved, so the two grids
     read the same way. */
  function fmtAllowCell(lines){
    if(!lines.length) return {text:"–", title:""};
    var qty = lines.reduce(function(a,l){ return a + l.qty; }, 0);
    var text = fmt(qty) + " " + (lines.length === 1 ? wt(lines[0].code).unit : "×" + lines.length);
    var title = lines.map(function(l){
      return wt(l.code).name + ": " + fmt(l.qty) + " " + wt(l.code).unit + " · " + PROJECTS[l.p].code + (l.note ? " (" + l.note + ")" : "");
    }).join(", ");
    return {text:text, title:title};
  }

  /* Same layout as renderAlreadyGrid (hours), so the leader reads both the
     same way: a day-by-day grid instead of a flat card list. A cell can
     still hide detail when a person has more than one wage type the same
     day, that's what the tooltip is for. */
  function renderAlreadyAllowGrid(members){
    var wrap = $("alreadyAllowGrid");
    if(!wrap) return;
    wrap.innerHTML = "";
    wrap.className = "tsgrid team readonly";

    var head = document.createElement("div");
    head.className = "row head";
    head.appendChild(el("div","","Employee"));
    DAYS.forEach(function(d,i){ var c = el("div", i>4?"we":"", ""); appendDayLabel(c, i); head.appendChild(c); });
    head.appendChild(el("div","","Total"));
    head.appendChild(el("div","",""));
    wrap.appendChild(head);

    members.forEach(function(m){
      var entries = state.massLog.filter(function(e){
        return e.kind === "allowance" && e.pernr === m.pernr && WORKDATES.indexOf(e.date) !== -1;
      });
      var row = document.createElement("div");
      row.className = "row";
      row.appendChild(el("div","rowmeta", m.name));
      var units = {};
      DAYS.forEach(function(d,i){
        var lines = entries.filter(function(e){ return e.day === i; });
        var info = fmtAllowCell(lines);
        var cls = "already-cell" + (i>4 ? " we" : "") + (memberBlocked(m,i) ? " abs" : "");
        var cell = el("div", cls, info.text);
        if(memberBlocked(m,i)) cell.title = "Approved " + m.abs[i].toLowerCase();
        else if(lines.length) cell.title = info.title;
        if(lines.length){
          lines.forEach(function(l){ units[wt(l.code).unit] = (units[wt(l.code).unit]||0) + l.qty; });
        }
        row.appendChild(cell);
      });
      var unitKeys = Object.keys(units);
      var totTxt = unitKeys.length === 0 ? "–" : (unitKeys.length === 1 ? fmt(units[unitKeys[0]]) + " " + unitKeys[0] : entries.length + " lines");
      row.appendChild(el("div","rowtot", totTxt));
      row.appendChild(el("div","",""));
      wrap.appendChild(row);
    });
  }

  function renderTeam(){
    var wrap = $("teamGrid");
    if(!wrap) return;

    /* project options, limited to the leader's scope. This has to run
       before teamOf(), which reads #mProj's current value to decide who's
       even on the roster now. */
    var pj = $("mProj");
    if(pj && !pj.dataset.for || (pj && pj.dataset.for !== state.leader)){
      var keep = pj.value;
      pj.innerHTML = "";
      projectsOf(state.leader).forEach(function(i){
        var o = document.createElement("option");
        o.value = String(i); o.textContent = PROJECTS[i].code + " · " + PROJECTS[i].name;
        pj.appendChild(o);
      });
      pj.dataset.for = state.leader;
      if(keep && pj.querySelector('option[value="'+keep+'"]')) pj.value = keep;
    }

    var members = teamOf(state.leader);

    $("teamCount").textContent = members.length + (members.length === 1 ? " person" : " people");

    renderAlreadyGrid(members);
    renderAlreadyAllowGrid(members);

    wrap.innerHTML = "";
    var anyClock = members.some(function(m){ return profileFor(WORKDATES[0], m.bukrs).clock; });
    var anyDur = members.some(function(m){ return !profileFor(WORKDATES[0], m.bukrs).clock; });
    wrap.className = "tsgrid team" + (anyClock ? " clock" : "");
    /* Only show the fields this team can actually use: an all-Z_CONS team has
       nothing to do with Start/End, an all-Z_BSRV team has nothing to do with
       Duration. Both stayed visible regardless before, which read as broken
       when neither field did anything for the team on screen. */
    if($("mDurWrap")) $("mDurWrap").hidden = !anyDur;
    if($("mBegWrap")) $("mBegWrap").hidden = !anyClock;
    if($("mEndWrap")) $("mEndWrap").hidden = !anyClock;

    var head = document.createElement("div");
    head.className = "row head";
    head.appendChild(el("div","","Employee"));
    DAYS.forEach(function(d,i){ var c = el("div", i>4?"we":"", ""); appendDayLabel(c, i); head.appendChild(c); });
    head.appendChild(el("div","","Total"));
    head.appendChild(el("div","",""));
    wrap.appendChild(head);

    members.forEach(function(m){
      var st = stagedOf(m.pernr);
      var row = document.createElement("div");
      row.className = "row" + (m.locked ? " locked" : "");

      var meta = el("div","rowmeta","");
      var p = el("div","p","");
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = st.sel;
      cb.disabled = m.locked;
      cb.setAttribute("aria-label","Select "+m.name);
      cb.onchange = function(){ st.sel = cb.checked; renderTeam(); };
      p.appendChild(cb);
      p.appendChild(el("span","", m.name));
      var code = document.createElement("code"); code.textContent = m.pernr; p.appendChild(code);
      meta.appendChild(p);
      /* teamOf() only lists people allocated to the project selected above,
         so everyone in this loop already qualifies - no need to spell out
         which project(s), the roster itself is the answer. */
      var sub = m.role + " · " + m.bukrs + " · " + profileFor(WORKDATES[0], m.bukrs).code;
      var absDays = Object.keys(m.abs).map(Number).sort(function(a,b){ return a-b; });
      if(absDays.length){
        sub += " · " + absDays.map(function(d){ return DAYS[d] + " " + m.abs[d].toLowerCase(); }).join(", ");
      }
      if(m.locked) sub += " · week already approved";
      var s = el("div","s", sub);
      if(m.locked) s.style.color = "var(--warn)";
      meta.appendChild(s);
      row.appendChild(meta);

      st.h.forEach(function(v,i){
        if(state.teamTab === "allow"){
          /* The grid is shared across tabs so selection stays put, but on
             Allowances it has nothing to do with hours: show what's staged
             (not yet saved) for this person and day instead, so the leader
             sees it land here, not only in the list below. */
          var lines = state.stagedAllow.filter(function(a){ return a.pernr === m.pernr && a.day === i; });
          var info = fmtAllowCell(lines);
          var cell = el("div","allowcell" + (i>4 ? " we" : ""), info.text);
          if(lines.length){
            cell.title = info.title + " · staged, not saved";
            cell.classList.add("pending");
          }
          row.appendChild(cell);
          return;
        }
        var clock = profileFor(WORKDATES[i], m.bukrs).clock;
        if(clock){
          /* Z_BSRV is filled from the Start/End fields above, not per cell. An
             unstaged cell is just empty, not a form field waiting for input:
             the only place to fill it is Apply to selected. Once staged, the
             leader sees exactly what was recorded, project included, without
             waiting for the save log. */
          var t = st.t[i];
          if(!t){
            var ph = el("div","cell computed" + (i>4 ? " we" : ""), "–");
            ph.title = "Z_BSRV records start and end. Use the Start/End fields above, for the people this applies to.";
            if(memberBlocked(m,i)){ ph.classList.add("abs"); ph.title = "Approved "+m.abs[i].toLowerCase(); }
            if(!periodOpen(WORKDATES[i], m.bukrs)){ ph.classList.add("closed"); ph.title = "Closed period"; }
            row.appendChild(ph);
            return;
          }
          var box = el("div","clockcell" + (i>4 ? " we" : ""), "");
          ["b","e"].forEach(function(k){
            var tinp = document.createElement("input");
            tinp.type = "text";
            tinp.className = "tinp";
            tinp.value = fmtClock(t[k]);
            tinp.disabled = true;
            tinp.setAttribute("aria-label", (k === "b" ? "Start time, " : "End time, ") + m.name + ", " + DAYS[i]);
            box.appendChild(tinp);
          });
          box.appendChild(el("div","cdur", v ? fmt(v) + " h" : "–"));
          box.title = PROJECTS[massProject()].code + " · " + fmtClock(t.b) + "–" + fmtClock(t.e);
          if(memberBlocked(m,i)){ box.classList.add("abs"); box.title = "Approved "+m.abs[i].toLowerCase(); }
          if(!periodOpen(WORKDATES[i], m.bukrs)){ box.classList.add("closed"); box.title = "Closed period"; }
          row.appendChild(box);
          return;
        }
        var inp = document.createElement("input");
        inp.type = "text";
        inp.className = "cell" + (i>4 ? " we" : "");
        inp.value = v ? fmt(v) : "";
        inp.inputMode = "decimal";
        inp.disabled = m.locked || memberBlocked(m,i) || !periodOpen(WORKDATES[i], m.bukrs);
        inp.title = v ? (PROJECTS[massProject()].code + " · " + fmt(v) + " h") : "";
        inp.setAttribute("aria-label","Hours for "+m.name+", "+DAYS[i]);
        if(memberBlocked(m,i)){ inp.classList.add("abs"); inp.title = "Approved "+m.abs[i].toLowerCase(); }
        if(!periodOpen(WORKDATES[i], m.bukrs)){ inp.classList.add("closed"); inp.title = "Closed period"; }
        inp.addEventListener("change", function(){
          var parsed = parseDur(inp.value);
          if(isNaN(parsed)){ toast("Couldn't read “"+inp.value+"”."); renderTeam(); return; }
          st.h[i] = round15(parsed);
          st.t[i] = null;
          renderTeam();
        });
        row.appendChild(inp);
      });

      if(state.teamTab === "allow"){
        var mLines = state.stagedAllow.filter(function(a){ return a.pernr === m.pernr; });
        var totTxt = "–";
        if(mLines.length){
          var units = {};
          mLines.forEach(function(l){ var u = wt(l.code).unit; units[u] = (units[u]||0) + l.qty; });
          var unitKeys = Object.keys(units);
          totTxt = unitKeys.length === 1 ? fmt(units[unitKeys[0]]) + " " + unitKeys[0] : mLines.length + " staged";
        }
        row.appendChild(el("div","rowtot", totTxt));
      } else {
        var tot = st.h.reduce(function(a,b){ return a+(b||0); },0);
        row.appendChild(el("div","rowtot", tot ? fmt(tot) : "–"));
      }
      var act = el("div","rowact","");
      if(st.err){
        var flag = el("span","errdot","!");
        flag.title = st.err;
        act.appendChild(flag);
      }
      row.appendChild(act);
      wrap.appendChild(row);
    });

    var sel = members.filter(function(m){ return stagedOf(m.pernr).sel; }).length;
    var staged = members.reduce(function(a,m){ return a + stagedOf(m.pernr).h.reduce(function(x,y){ return x+(y||0); },0); },0);
    $("mSel").textContent = sel + " selected";
    if(state.teamTab === "allow"){
      var n = state.stagedAllow.length;
      $("mStaged").innerHTML = n + "<small> " + (n === 1 ? "line" : "lines") + " staged</small>";
    } else {
      $("mStaged").innerHTML = fmt(staged) + "<small> h staged</small>";
    }
    $("mSave").disabled = staged === 0;

    renderMassLog();
    renderBonusPanel();
    renderMassAllowList();
    setTeamTab(state.teamTab);
  }

  /* Fills duration for people on a duration profile, and start/end for people
     on Z_BSRV, in the same click. A mixed selection (Carlos Pinto's team has
     both) uses whichever field applies to each person; a cell whose profile
     needs the field left blank is skipped, not guessed. */
  function applyMass(){
    var members = teamOf(state.leader).filter(function(m){ return stagedOf(m.pernr).sel && !m.locked; });
    if(!members.length){ toast("Select at least one person first."); return; }
    var dur = parseDur($("mDur").value);
    var hasDur = !isNaN(dur) && dur > 0;
    var bTxt = $("mBeg") ? $("mBeg").value : "", eTxt = $("mEnd") ? $("mEnd").value : "";
    var b = parseClock(bTxt), e = parseClock(eTxt);
    var hasClock = bTxt.trim() !== "" && eTxt.trim() !== "" && !isNaN(b) && !isNaN(e);
    if(!hasDur && !hasClock){ toast("Give a duration, or a start and end time."); return; }
    var days = [];
    Array.prototype.forEach.call(document.querySelectorAll(".mHoursDays input:checked"), function(c){ days.push(+c.value); });
    if(!days.length){ toast("Pick at least one day."); return; }
    var touched = 0, skipped = 0;
    members.forEach(function(m){
      var st = stagedOf(m.pernr);
      days.forEach(function(d){
        if(memberBlocked(m,d) || !periodOpen(WORKDATES[d], m.bukrs)) return;
        var clock = profileFor(WORKDATES[d], m.bukrs).clock;
        if(clock){
          if(!hasClock){ skipped++; return; }
          st.t[d] = {b:b, e:e};
          st.h[d] = slotHours(st.t[d]);
        } else {
          if(!hasDur){ skipped++; return; }
          st.t[d] = null;
          st.h[d] = round15(dur);
        }
        touched++;
      });
    });
    renderTeam();
    var msg = touched + " cells filled for " + members.length + " people. Nothing is saved yet, review the grid first.";
    if(skipped) msg += " " + skipped + " cell" + (skipped === 1 ? "" : "s") + " skipped, needs the other field for that profile.";
    toast(msg);
  }

  function clearMass(){
    Object.keys(state.staged).forEach(function(k){ state.staged[k] = {sel:false, h:[0,0,0,0,0,0,0], t:[null,null,null,null,null,null,null], err:""}; });
    state.stagedAllow = [];
    renderTeam();
  }

  /* Partial save. Every row is validated on its own and the ones that pass are
     written, with CREATED_BY as the leader and ON_BEHALF_OF as the employee. */
  /* onlyPernrs, when given, restricts the commit to those people, leaving
     anyone else's staged-but-unsaved hours exactly as they were: without
     it, this saves every nonzero staged line for the whole team, which is
     what "Save staged entries" on screen means (several people can be
     staged in separate batches before one Save). The chat assistant passes
     it, scoped to whoever its own confirmation card named, so a person's
     unrelated staged hours from an earlier, still-unconfirmed manual batch
     never get swept into a save the person never saw or confirmed. */
  function saveMass(onlyPernrs){
    var leader = leaderById(state.leader);
    var members = teamOf(state.leader);
    if(onlyPernrs) members = members.filter(function(m){ return onlyPernrs.indexOf(m.pernr) !== -1; });
    var saved = 0, kept = 0, savedPeople = 0;
    var pIdx = massProject();
    members.forEach(function(m){
      var st = stagedOf(m.pernr);
      var total = st.h.reduce(function(a,b){ return a+(b||0); },0);
      if(total === 0){ st.err = ""; return; }
      var err = "";
      if(m.locked) err = "Week already approved, the line was left untouched.";
      else if(!isEligibleForProject(m, pIdx)) err = m.name.split(" ")[0] + " is not allocated to " + PROJECTS[pIdx].code + ".";
      else {
        for(var d=0; d<7; d++){
          if(!st.h[d]) continue;
          if(memberBlocked(m,d)){ err = DAYS[d] + " has an approved " + m.abs[d].toLowerCase() + "."; break; }
          if(!periodOpen(WORKDATES[d], m.bukrs)){ err = DAYS[d] + " falls in a closed period."; break; }
          if(st.h[d] > 24){ err = DAYS[d] + " is above 24 hours."; break; }
          if(profileFor(WORKDATES[d], m.bukrs).clock && (!st.t[d] || st.t[d].b === null || st.t[d].e === null)){
            err = DAYS[d] + " needs both a start and an end for " + m.name.split(" ")[0] + "."; break;
          }
        }
      }
      if(err){ st.err = err; kept++; return; }
      st.err = "";
      for(var i=0; i<7; i++){
        if(!st.h[i]) continue;
        state.massLog.push({
          kind: "hours",
          pernr: m.pernr, name: m.name, date: WORKDATES[i], day: i, hours: st.h[i],
          p: pIdx, createdBy: leader.name, onBehalf: m.pernr,
          profile: profileFor(WORKDATES[i], m.bukrs).code,
          beg: st.t[i] ? st.t[i].b : null, end: st.t[i] ? st.t[i].e : null
        });
        saved++;
      }
      savedPeople++;
      state.staged[m.pernr] = {sel:false, h:[0,0,0,0,0,0,0], t:[null,null,null,null,null,null,null], err:""};
    });
    renderTeam();
    var who = savedPeople + (savedPeople === 1 ? " person" : " people");
    var left = kept + (kept === 1 ? " line stayed" : " lines stayed");
    if(saved && kept) toast(saved + " entries saved for " + who + ". " + left + " on screen with the reason.");
    else if(saved) toast(saved + " entries saved for " + who + ", recorded on their behalf.");
    else toast("Nothing was saved. Every line has a reason next to it.");
  }

  /* ---------- allowances, mass entry ----------
     Same partial, staged-then-saved pattern as hours, but the line items are
     flat (an allowance is one occurrence, not a per-day grid cell), so
     they're staged in a list instead of a second grid. The bonus wage type
     never appears here, it stays the project owner's separate panel. */
  function massWageTypes(){
    /* the team can mix companies (Carlos Pinto has PT01 and PT02 people), so
       the shift allowance is offered if anyone on the team could use it, not
       just whoever happens to be first in the list */
    var anyShiftCompany = teamOf(state.leader).some(function(m){ return m.bukrs === "PT02"; });
    return WAGETYPES.filter(function(w){ return w.selfEntry && (w.code !== "TURNO" || anyShiftCompany); });
  }
  function syncMassAllowForm(){
    var sel = $("mAllowCode");
    if(!sel) return;
    var w = wt(sel.value);
    if(!w) return;
    $("mAllowUnit").textContent = w.unit;
    $("mAllowNoteWrap").hidden = !w.noteLabel;
    $("mAllowNoteLbl").textContent = w.noteLabel || "Note";
  }
  function applyMassAllow(){
    var members = teamOf(state.leader).filter(function(m){ return stagedOf(m.pernr).sel && !m.locked; });
    if(!members.length){ toast("Select at least one person first."); return; }
    var w = wt($("mAllowCode").value);
    var qty = parseDur($("mAllowQty").value);
    if(isNaN(qty) || qty <= 0){ toast("Give a quantity above zero."); return; }
    var note = $("mAllowNote").value.trim();
    if(w.noteLabel && !note){ toast(w.noteLabel + " is required for " + w.name + "."); return; }
    var days = [];
    Array.prototype.forEach.call(document.querySelectorAll(".mAllowDays input:checked"), function(c){ days.push(+c.value); });
    if(!days.length){ toast("Pick at least one day."); return; }
    var pIdx = w.needProj ? massProject() : 3;
    var added = 0, skippedCompany = 0, skippedProject = 0;
    members.forEach(function(m){
      if(w.code === "TURNO" && m.bukrs !== "PT02"){ skippedCompany++; return; }
      /* A leader who owns more than one project can have a team member
         selected who isn't actually allocated to the project currently
         picked (they're on the team through the leader's other project):
         skip them here too, same as Hours already does at save time. */
      if(w.needProj && !isEligibleForProject(m, pIdx)){ skippedProject++; return; }
      days.forEach(function(d){
        if(!periodOpen(WORKDATES[d], m.bukrs)) return;
        state.stagedAllow.push({pernr:m.pernr, name:m.name, code:w.code, day:d, p:pIdx, qty:round15(qty), note:note});
        added++;
      });
    });
    renderTeam();
    var msg = added + " allowance line" + (added === 1 ? "" : "s") + " staged for " + members.length + " people. Nothing is saved yet.";
    if(skippedCompany) msg += " " + skippedCompany + " skipped, the shift allowance doesn't apply to their company.";
    if(skippedProject) msg += " " + skippedProject + " skipped, not allocated to " + PROJECTS[pIdx].code + ".";
    toast(msg);
  }
  function clearMassAllow(){
    state.stagedAllow = [];
    renderTeam();
  }
  /* Same onlyPernrs scoping as saveMass(): without it, every staged
     allowance line is committed and cleared, which is what "Save staged
     allowances" on screen means. The chat assistant passes it, scoped to
     its own confirmation card, so someone else's still-unconfirmed staged
     lines are left in place instead of being saved (or wiped) alongside it. */
  function saveMassAllow(onlyPernrs){
    var lines = onlyPernrs
      ? state.stagedAllow.filter(function(a){ return onlyPernrs.indexOf(a.pernr) !== -1; })
      : state.stagedAllow;
    if(!lines.length){ toast("Nothing staged."); return; }
    var leader = leaderById(state.leader);
    lines.forEach(function(a){
      state.massLog.push({
        kind: "allowance",
        pernr: a.pernr, name: a.name, date: WORKDATES[a.day], day: a.day,
        code: a.code, qty: a.qty, note: a.note, p: a.p,
        createdBy: leader.name, onBehalf: a.pernr
      });
    });
    var n = lines.length;
    state.stagedAllow = onlyPernrs
      ? state.stagedAllow.filter(function(a){ return onlyPernrs.indexOf(a.pernr) === -1; })
      : [];
    renderTeam();
    toast(n + " allowance " + (n === 1 ? "line" : "lines") + " saved, recorded on their behalf.");
  }
  function renderMassAllowList(){
    var box = $("mAllowList");
    if(!box) return;
    /* wage type options, limited to what this leader's team can record */
    var sel = $("mAllowCode");
    if(sel && sel.dataset.for !== state.leader){
      var keep = sel.value;
      sel.innerHTML = "";
      massWageTypes().forEach(function(w){
        var o = document.createElement("option");
        o.value = w.code; o.textContent = w.name + " (" + w.lgart + ")";
        sel.appendChild(o);
      });
      sel.dataset.for = state.leader;
      if(keep && sel.querySelector('option[value="'+keep+'"]')) sel.value = keep;
      syncMassAllowForm();
    }
    $("mAllowStagedCount").textContent = state.stagedAllow.length + (state.stagedAllow.length === 1 ? " staged" : " staged");
    if($("mAllowProj")){
      $("mAllowProj").textContent = PROJECTS[massProject()].code + " · " + PROJECTS[massProject()].name;
    }
    $("mAllowSave").disabled = state.stagedAllow.length === 0;
    box.innerHTML = "";
    if(!state.stagedAllow.length){
      box.appendChild(el("div","paused","Nothing staged yet."));
      return;
    }
    state.stagedAllow.forEach(function(a){
      var w = wt(a.code);
      var c = el("div","abscard","");
      var h = el("div","h","");
      h.appendChild(el("b","", a.name));
      h.appendChild(el("span","chip grey", fmt(a.qty) + " " + w.unit));
      c.appendChild(h);
      c.appendChild(el("div","why", DAYS[a.day] + " · " + PROJECTS[a.p].code + " · wage type " + w.lgart));
      if(a.note) c.appendChild(el("div","why", a.note));
      box.appendChild(c);
    });
  }

  /* state.massLog holds every mass entry ever recorded, across every week,
     not just this one - it's the CATS payload's audit trail too. Without
     this filter, switching weeks left last week's entries on screen, and
     DAYS[e.day] read them against the WRONG week's calendar, so "Tue 15"
     silently relabelled itself "Tue 22" the moment the visible week
     changed, still pointing at the same stored day-of-week offset. */
  function massLogThisWeek(){
    return state.massLog.filter(function(e){ return WORKDATES.indexOf(e.date) !== -1; });
  }
  function renderMassLog(){
    var box = $("massLog");
    if(!box) return;
    box.innerHTML = "";
    var weekLog = massLogThisWeek();
    $("massLogCount").textContent = weekLog.length + (weekLog.length === 1 ? " entry" : " entries");
    if(!weekLog.length){
      box.appendChild(el("div","paused","Nothing recorded on behalf of the team yet, this week."));
      return;
    }
    weekLog.slice(-12).reverse().forEach(function(e){
      var c = el("div","abscard","");
      var h = el("div","h","");
      h.appendChild(el("b","", e.name));
      if(e.kind === "bonus"){
        h.appendChild(el("span","chip green", fmt(e.amount) + " EUR"));
        c.appendChild(h);
        c.appendChild(el("div","why", DAYS[e.day] + " · " + PROJECTS[e.p].code + " · " + wt(e.code).name));
        c.appendChild(el("div","why", e.note));
      } else if(e.kind === "allowance"){
        var w = wt(e.code);
        h.appendChild(el("span","chip grey", fmt(e.qty) + " " + w.unit));
        c.appendChild(h);
        c.appendChild(el("div","why", DAYS[e.day] + " · " + PROJECTS[e.p].code + " · " + w.name));
      } else {
        h.appendChild(el("span","chip grey", fmt(e.hours) + " h"));
        c.appendChild(h);
        var line = DAYS[e.day] + " · " + PROJECTS[e.p].code + " · " + e.profile;
        if(e.beg !== null && e.beg !== undefined) line += " · " + fmtClock(e.beg) + "–" + fmtClock(e.end);
        c.appendChild(el("div","why", line));
      }
      c.appendChild(el("div","why", "CREATED_BY " + e.createdBy + " · ON_BEHALF_OF " + e.onBehalf));
      box.appendChild(c);
    });
  }

  /* ---------- bonus, created by the project owner ----------
     The only allowance carrying an amount and the only one the employee does
     not record. Defining the value and approving are the same act, by the same
     person, so there is no separate approval step. Every leader in Team entry
     is a project owner (scope is by project, never by line hierarchy), so the
     panel is always available here. */
  function renderBonusPanel(){
    var panel = $("bonusPanel");
    if(!panel) return;
    var leader = leaderById(state.leader);
    /* visibility is owned by setTeamTab() now, one of the three mass-entry
       tabs, not this function — every leader is a project owner so the
       tab itself is always enabled, just not always the active one.
       Who it's for comes from the Team grid's own checkboxes, same as
       Hours and Allowances, instead of a second, separate picker here. */
    $("bProj").textContent = PROJECTS[massProject()].code + " · " + PROJECTS[massProject()].name;
    var box = $("bonusList");
    box.innerHTML = "";
    var mine = state.allow.filter(function(a){ return wt(a.code).amount; });
    if(!mine.length){ box.appendChild(el("div","paused","No bonus recorded on this project yet.")); return; }
    mine.forEach(function(a){
      var c = el("div","abscard bonus","");
      var h = el("div","h","");
      h.appendChild(el("b","", a.forName || "Employee"));
      h.appendChild(el("span","chip green", fmt(a.amount) + " EUR"));
      c.appendChild(h);
      c.appendChild(el("div","why", DAYS[a.day] + " · " + PROJECTS[a.p].code + " · wage type " + wt(a.code).lgart));
      c.appendChild(el("div","why", a.note));
      c.appendChild(el("div","why", "Defined and approved by " + a.byName + ", in the same act"));
      box.appendChild(c);
    });
  }
  function saveBonus(){
    var leader = leaderById(state.leader);
    var pIdx = massProject();
    var members = teamOf(state.leader).filter(function(m){ return stagedOf(m.pernr).sel && !m.locked; });
    if(!members.length){ toast("Select at least one person first."); return; }
    var amount = parseDur($("bAmount").value);
    var note = $("bNote").value.trim();
    if(isNaN(amount) || amount <= 0){ toast("The amount needs to be a number above zero."); return; }
    if(!note){ toast("The bonus needs a reason. It is the only trace of why the project carried this cost."); return; }
    /* A leader who owns more than one project can have someone selected who
       isn't actually allocated to the project picked above (they're on the
       team through the leader's other project): skip them, same partial-save
       pattern as Hours and Allowances, rather than billing the wrong project. */
    var eligible = members.filter(function(m){ return isEligibleForProject(m, pIdx); });
    var ineligible = members.filter(function(m){ return !isEligibleForProject(m, pIdx); });
    if(!eligible.length){ toast("None of the selected people are allocated to " + PROJECTS[pIdx].code + "."); return; }
    var recorded = [], noOpenDay = [];
    eligible.forEach(function(who){
      var day = -1;
      for(var i=4; i>=0; i--){ if(periodOpen(WORKDATES[i], who.bukrs)){ day = i; break; } }
      /* Every weekday closed is the same "nothing open to bill to" case
         Hours and Allowances already skip with a reason, not a silent
         write to whatever day the loop happened to start from. */
      if(day === -1){ noOpenDay.push(who); return; }
      state.allow.push({
        id:"al"+(nextId++), day:day, p:pIdx, code:"BONUS", qty:1, amount:amount,
        note:note, by:leader.id, onBehalf:who.pernr, byName:leader.name, forName:who.name
      });
      state.massLog.push({
        kind:"bonus", pernr:who.pernr, name:who.name, date:WORKDATES[day], day:day,
        code:"BONUS", amount:amount, note:note, p:pIdx,
        createdBy:leader.name, onBehalf:who.pernr
      });
      recorded.push(who);
    });
    $("bAmount").value = ""; $("bNote").value = "";
    render();
    var msg = recorded.length
      ? fmt(amount) + " EUR bonus recorded for " + recorded.map(function(m){ return m.name; }).join(", ") + ", approved in the same act."
      : "Nothing was actually recorded.";
    if(ineligible.length) msg += " " + ineligible.map(function(m){ return m.name.split(" ")[0]; }).join(", ") + " skipped, not allocated to " + PROJECTS[pIdx].code + ".";
    if(noOpenDay.length) msg += " " + noOpenDay.map(function(m){ return m.name.split(" ")[0]; }).join(", ") + " skipped, every day this week falls in a closed period.";
    toast(msg);
  }

  /* ---------- actions ---------- */
  function addRow(){
    if(isMonthly()) return addMonthRow();
    if(state.submitted) return;
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
    w.allow = state.allow;
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
    state.allow = w.allow || (w.allow = []);
    state.sugs = w.sugs;
    state.submitted = w.submitted;
    state.deviationNote = w.deviationNote || "";
  }
  /* My week's own arrows step by month for consulting (changeWeek below);
     the Team screen's arrows (prevW2/nextW2) call this directly instead,
     because a leader stepping through the team's log week by week isn't
     the same navigation as the monthly My week view, even though both
     screens read the same underlying "current week". */
  function changeWeekByOne(delta){
    var next = weekIdx + delta;
    if(next < 0 || next >= WEEKS.length){
      toast(delta < 0 ? "No earlier sample weeks." : "No later sample weeks.");
      return;
    }
    saveCurrentWeek();
    loadWeek(next);
    render();
  }
  function changeWeek(delta){
    if(isMonthly()) return changeMonth(delta);
    return changeWeekByOne(delta);
  }
  function applyTemplate(){
    if(state.submitted) return;
    state.rows.forEach(function(r){
      for(var i=0; i<5; i++){ if(!r.h[i]) r.h[i] = PROJECTS[r.p].proj ? 1.5 : 0.5; }
    });
    render();
    toast("Allocation template applied to working days.", "Undo", function(){ location.reload(); });
  }
  /* ---------- company switch, demo of the IT0001 derivation ----------
     Changing the company is the same as opening the sheet as someone assigned
     to the other one. Nothing else decides the layout. */
  function seedClock(){
    for(var d=0; d<7; d++){
      var cursor = 8*60, lunched = false;
      state.rows.forEach(function(r){
        if(!r.h[d] || slot(r,d)) return;
        if(!lunched && cursor >= 13*60){ cursor += 60; lunched = true; }
        setSlot(r, d, {b:cursor, e:cursor + Math.round(r.h[d]*60)});
        cursor += Math.round(r.h[d]*60);
      });
    }
  }
  function switchCompany(bukrs){
    if(bukrs === IT0001.bukrs) return;
    saveCurrentWeek();
    var curNum = WEEKS[weekIdx].num;
    IT0001.bukrs = bukrs;
    WEEKS = bukrs === "PT02" ? WEEKS_PT02 : WEEKS_PT01;
    /* WEEKS_PT01 and WEEKS_PT02 no longer line up index for index - PT01
       alone has weeks either side for the monthly view - so land on the
       same week NUMBER in the new array, not the same array position;
       falling back to week 38 (present in both) if this company doesn't
       have that number at all. */
    var match = WEEKS.filter(function(w){ return w.num === curNum; })[0];
    if(!match) match = WEEKS.filter(function(w){ return w.num === 38; })[0];
    loadWeek(match ? WEEKS.indexOf(match) : 0);
    if(isClock()) seedClock();
    renderLeaderOptions();
    clearMass();
    render();
    var pf = profileFor(WORKDATES[0]);
    toast("IT0001 now reads " + bukrs + ". ZTIME_COMPANY_CFG maps it to " + pf.code + ": " + pf.fields.toLowerCase() + ".");
  }

  function togglePrivate(){
    state.privateMode = !state.privateMode;
    var cap = $("capture");
    cap.classList.toggle("off", state.privateMode);
    $("captureTxt").textContent = state.privateMode ? "Capture paused" : "Suggestions on, private timeline";
    if($("privBtn")) $("privBtn").textContent = state.privateMode ? "Resume capture" : "Private mode";
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
    box.appendChild(chipSelect(
      pIdx === -1 ? "" : String(pIdx),
      PROJECTS.map(function(p,i){ return {value:String(i), label:p.code + " · " + p.name}; }),
      pIdx === -1 ? "warnc" : "okc",
      function(v){
        if(v === "") return;
        $("nlq").value = nlText(dur, day, +v, desc);
        parseNL();
      },
      "project to choose"
    ));
    box.appendChild(chip(pIdx === -1 ? "activity to set" : PROJECTS[pIdx].act, pIdx === -1 ? "" : "okc"));
    if(pIdx !== -1) box.appendChild(chip(PROJECTS[pIdx].sap.rproj ? "PEP "+PROJECTS[pIdx].sap.rproj : "cost center "+PROJECTS[pIdx].sap.rkostl, "okc"));
    if(desc) box.appendChild(chip("description: "+desc.slice(0,42), "okc"));

    var ok = !isNaN(dur) && dur > 0 && pIdx !== -1;
    nlParsed = ok ? {dur:round15(dur), day:day, p:pIdx, desc:desc} : null;
    $("nlSave").disabled = !ok;
  }
  /* Returns whether the entry was actually saved: the dialog is a native
     <form method="dialog">, which closes itself on any button click
     regardless of what the handler does, so the onclick wrapper below needs
     this to know when to preventDefault() and keep it open instead, rather
     than closing over a rejected save as if it had gone through. */
  function saveNL(){
    if(!nlParsed) return false;
    if(state.submitted){ toast("The week is submitted, it can't be changed."); return false; }
    if(isBlocked(nlParsed.day)){ toast(DAYS[nlParsed.day]+" has an approved absence, doesn't accept time entries."); return false; }
    if(!periodOpen(WORKDATES[nlParsed.day])){ toast(DAYS[nlParsed.day]+" falls in a closed period, it can't take new hours."); return false; }
    var row = state.rows.filter(function(r){ return r.p === nlParsed.p; })[0];
    if(!row){ row = {id:nextId++, p:nlParsed.p, desc:nlParsed.desc, h:[0,0,0,0,0,0,0], origin:"Manual"}; state.rows.push(row); }
    if(nlParsed.desc) row.desc = nlParsed.desc;
    row.h[nlParsed.day] += nlParsed.dur;
    render();
    toast(fmt(nlParsed.dur)+" h recorded in "+PROJECTS[nlParsed.p].code+", "+DAYS[nlParsed.day]+".");
    return true;
  }

  /* ---------- detail ---------- */
  var dtRow = null;
  /* day is which calendar column was clicked, only meaningful for Z_BSRV
     (Building Solutions): that profile records start and end per day, not
     one duration for the week, so a day-specific click there needs to
     show that day's actual window, not the row's total. */
  function openDetail(r, day){
    dtRow = r;
    var pr = PROJECTS[r.p];
    $("dtTitle").textContent = pr.name;
    var pj = $("dtProj");
    pj.innerHTML = "";
    PROJECTS.forEach(function(p,i){
      var o = document.createElement("option");
      o.value = String(i); o.textContent = p.code + " · " + p.wbs;
      pj.appendChild(o);
    });
    pj.value = String(r.p);
    pj.disabled = state.submitted;
    /* Activity type isn't its own choice here, it comes from whichever
       project is picked (each project has exactly one, in SAP terms its
       LSTAR), so it follows the project select instead of being a second,
       independent field that could disagree with it. */
    pj.onchange = function(){ $("dtAct").value = PROJECTS[+pj.value].act; };
    $("dtDur").value = fmt(rowTotal(r));
    $("dtDesc").value = r.desc;
    $("dtAct").value = pr.act;
    $("dtOrigin").textContent = r.origin;
    var showClock = isClock() && typeof day === "number";
    $("dtStartField").hidden = !showClock;
    $("dtEndField").hidden = !showClock;
    if(showClock){
      var s = slot(r, day);
      $("dtStart").value = s && s.b !== null ? fmtClock(s.b) : "–";
      $("dtEnd").value = s && s.e !== null ? fmtClock(s.e % 1440) : "–";
    }
    var st = $("dtState");
    st.textContent = state.submitted ? "In approval, read-only" : "Draft";
    st.className = state.submitted ? "chip blue" : "chip grey";
    $("dtDesc").readOnly = state.submitted;
    $("dtDur").readOnly = true;
    $("dtSave").disabled = state.submitted;
    $("dlgDetail").showModal();
  }
  function saveDetail(){
    if(!dtRow) return;
    var pj = $("dtProj");
    if(pj && !pj.disabled){
      var newP = +pj.value;
      if(newP !== dtRow.p){
        /* Every other path that touches state.rows (addRow, Quick Add,
           the chat) keeps at most one row per project, finding-or-creating
           rather than ever duplicating one. Re-pointing this row at a
           project that already has its own row would break that, and
           silently merging the two could surprise someone who didn't ask
           for their hours combined - so this asks them to resolve it on
           the grid first instead. */
        var clash = state.rows.some(function(r){ return r !== dtRow && r.p === newP; });
        if(clash){
          toast(PROJECTS[newP].code + " already has a row this week. Remove or merge it first.");
          return;
        }
        dtRow.p = newP;
      }
    }
    dtRow.desc = $("dtDesc").value; render(); toast("Entry updated.");
    $("dlgDetail").close();
  }

  /* ---------- submit ---------- */
  function openSubmitMonth(){
    var dates = activeMonthDates();
    var weeks = touchedWeeksFor(dates);
    var first = weeks[0];
    var ym = monthKeyOf(WEEKS[weekIdx]);
    var y = ym.slice(0,4), mIdx = +ym.slice(4,6) - 1;
    var monthName = MONTHS_NLP[mIdx].charAt(0).toUpperCase() + MONTHS_NLP[mIdx].slice(1);
    $("subTitle").textContent = "Submit " + monthName + " " + y;
    var byP = {};
    weeks.forEach(function(w){
      w.rows.forEach(function(r){
        var t = rowTotal(r);
        if(!t) return;
        var k = PROJECTS[r.p].code;
        if(!byP[k]) byP[k] = {name:PROJECTS[r.p].name, t:0, b:PROJECTS[r.p].proj, wbs:PROJECTS[r.p].sap.rproj || PROJECTS[r.p].sap.rkostl};
        byP[k].t += t;
      });
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
    var monthProj = weeks.reduce(function(a,w){ return a + w.rows.reduce(function(x,r){ return x + (PROJECTS[r.p].proj ? rowTotal(r) : 0); }, 0); }, 0);
    var tr = el("div","r t","");
    tr.appendChild(el("span","","Month total"));
    tr.appendChild(el("span","", fmt(monthProj)+" h in project"));
    tr.appendChild(el("span","n", fmt(monthTotalHours(dates))+" h"));
    sum.appendChild(tr);
    body.appendChild(sum);

    var warns = [];
    weeks.forEach(function(w){
      withWeek(w, function(){ validate().filter(function(m){ return m.sev === "w"; }).forEach(function(m){ warns.push({week:w, txt:m.txt}); }); });
    });
    if(warns.length){
      var wDiv = el("div","","");
      wDiv.innerHTML = "<div class='field'><label>"+warns.length+" warnings, they don't block submission</label></div>";
      var ul = el("div","sum","");
      warns.forEach(function(m){
        var r = el("div","r","");
        r.appendChild(el("span","", "Week "+m.week.num+": "+m.txt));
        r.appendChild(el("span","chip amber","warning"));
        r.appendChild(el("span","",""));
        ul.appendChild(r);
      });
      wDiv.appendChild(ul);
      body.appendChild(wDiv);
      var f = el("div","field","");
      f.innerHTML = "<label for='subWhy'>Justification for the deviation from the expected total</label><textarea id='subWhy' placeholder='One line is enough. Stays in the month's history.'></textarea>";
      body.appendChild(f);
      $("subWhy").value = first.deviationNote || "";
    }
    $("dlgSubmit").showModal();
  }
  function doSubmitMonth(){
    var weeks = activeMonthWeeks();
    var why = $("subWhy");
    var note = why ? why.value.trim() : "";
    weeks.forEach(function(w){ w.deviationNote = note; w.submitted = true; });
    state.submitted = true;
    state.deviationNote = note;
    $("dlgSubmit").close();
    render();
    toast(weeks.length + (weeks.length===1?" week":" weeks") + " submitted for approval.", "Reopen", function(){
      weeks.forEach(function(w){ w.submitted = false; });
      render();
    });
  }
  function openSubmit(){
    if(isMonthly()) return openSubmitMonth();
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
      $("subWhy").value = state.deviationNote || "";
    }
    $("dlgSubmit").showModal();
  }
  function doSubmit(){
    if(isMonthly()) return doSubmitMonth();
    var why = $("subWhy");
    state.deviationNote = why ? why.value.trim() : "";
    WEEKS[weekIdx].deviationNote = state.deviationNote;
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
    var apHours = $("apHours");
    if(apHours) apHours.innerHTML = fmt(state.approvals.reduce(function(a,x){ return a+x.tot; }, 0)) + "<small> h</small>";
    var apDev = $("apDev");
    if(apDev){
      var dev = state.approvals.reduce(function(a,x){ return a+x.dev; }, 0);
      apDev.innerHTML = (dev>0?"+":"") + fmt(dev) + "<small> h</small>";
    }

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
        var whoBtn = document.createElement("button");
        whoBtn.type = "button";
        whoBtn.className = "apwho";
        whoBtn.setAttribute("aria-expanded", a.expanded ? "true" : "false");
        whoBtn.innerHTML = "<span class='apchev'>"+(a.expanded ? "▾" : "▸")+"</span><span><div class='who'>"+a.who+"</div><div class='sub'>"+a.role+"</div></span>";
        whoBtn.onclick = function(){ a.expanded = !a.expanded; renderApprovals(); };
        c2.appendChild(whoBtn);
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
        if(a.expanded){
          var dtr = document.createElement("tr");
          dtr.className = "apdetail";
          var dtd = document.createElement("td");
          dtd.colSpan = 7;
          var wrap = document.createElement("div");
          wrap.className = "apdays";
          (a.days || []).forEach(function(h, i){
            var d = document.createElement("span");
            d.className = "apday" + (h ? "" : " empty");
            d.textContent = WEEKDAY_ABBR[i] + " " + (h ? fmt(h)+"h" : "–");
            wrap.appendChild(d);
          });
          dtd.appendChild(wrap);
          dtr.appendChild(dtd);
          body.appendChild(dtr);
        }
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
  /* A picklist styled as a chip, for the one place (Quick Add) that used to
     ask for a project code via window.prompt(): free text, no list of what's
     valid, easy to typo. options is [{value, label}]; placeholder, when
     given, is an extra unselectable first option for "nothing chosen yet". */
  function chipSelect(value, options, cls, fn, placeholder){
    var s = document.createElement("select");
    s.className = "pchip clickable " + (cls||"");
    if(placeholder){
      var ph = document.createElement("option");
      ph.value = ""; ph.textContent = placeholder; ph.disabled = true;
      if(value === "") ph.selected = true;
      s.appendChild(ph);
    }
    options.forEach(function(o){
      var opt = document.createElement("option");
      opt.value = o.value; opt.textContent = o.label;
      if(o.value === value) opt.selected = true;
      s.appendChild(opt);
    });
    s.onchange = function(){ fn(s.value); };
    return s;
  }
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
  /* A number changing inside an existing cell (an assistant entry merges
     into whatever that project/day already had) is easy to miss, there's
     no new row to draw the eye. Scrolls to the exact cell that changed and
     flashes it, so "did that actually save?" has an obvious answer. */
  function flashCell(rowId, day){
    var cell = document.getElementById("c-"+rowId+"-"+day);
    if(!cell) return;
    cell.scrollIntoView({block:"center", behavior:"smooth"});
    cell.classList.remove("just-saved");
    void cell.offsetWidth;
    cell.classList.add("just-saved");
    setTimeout(function(){ cell.classList.remove("just-saved"); }, 1800);
  }

  /* ---------- wiring ---------- */
  $("addRow").onclick = addRow;
  $("copyWeek").onclick = copyWeek;
  $("tplBtn").onclick = applyTemplate;
  $("quickBtn").onclick = function(){ openQuick("", 2); };
  $("submitBtn").onclick = openSubmit;
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
  $("nlSave").onclick = function(ev){ if(!saveNL()) ev.preventDefault(); };
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
  if($("prevW2")) $("prevW2").onclick = function(){ changeWeekByOne(-1); };
  if($("nextW2")) $("nextW2").onclick = function(){ changeWeekByOne(1); };

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
      ["semana","team","aprov","cats"].forEach(function(k){ $("screen-"+k).hidden = k !== s; });
      state.screen = s;
      if(s === "cats") renderCats();
      if(s === "team") renderTeam();
      window.scrollTo({top:0});
    };
  });

  /* ---------- conversational assistant, Joule pattern ---------- */
  var chat = {pending:null, greeted:false, draft:null, draftWeek:null, history:[], busy:false};

  function botToggle(force){
    var p = $("joulePanel");
    var open = typeof force === "boolean" ? force : p.hidden;
    p.hidden = !open;
    $("jouleFab").setAttribute("aria-expanded", open ? "true" : "false");
    if(open){
      if(!chat.greeted){
        chat.greeted = true;
        botSay("bot", "Hi Tiago! I can log hours, for you or for the team, check the week, sort out absences, approve timesheets, or just take you to the right screen. What do you need?");
        botChips(["How many hours do I have?","My absences","2h BNK testing yesterday","Submit the week"]);
      }
      setTimeout(function(){ $("jinput").focus(); }, 60);
    }
  }
  /* allowHtml is opt-in and only for our own static strings (the two help
     messages that style an example with <span class="num">). Everything
     else here can carry text the person typed or, for a Claude-backed
     reply, text the model wrote after reading what the person typed -
     prompt injection could put markup in either - so the default stays
     textContent, never innerHTML, for both bot and user lines. */
  function botSay(who, txt, node, allowHtml){
    var log = $("jlog");
    var b = el("div","jmsg "+who,"");
    if(txt){
      var t = el("div","jtxt","");
      if(who === "bot" && allowHtml) t.innerHTML = txt; else t.textContent = txt;
      b.appendChild(t);
    }
    if(node) b.appendChild(node);
    log.appendChild(b);
    log.scrollTop = log.scrollHeight;
    return b;
  }
  function sleep(ms){ return new Promise(function(resolve){ setTimeout(resolve, ms); }); }
  /* A reply that lands the instant you hit send reads as canned, not
     conversational. A short, slightly randomised pause plus a typing
     bubble gives the exchange a human beat, matched to how long a person
     takes to skim a message and start answering. */
  function thinkingDelay(){ return sleep(450 + Math.random()*400); }
  function showTyping(){
    hideTyping();
    var log = $("jlog");
    var b = el("div","jmsg bot","");
    b.id = "jtypingBubble";
    var t = el("div","jtxt typing","");
    t.appendChild(el("span","","")); t.appendChild(el("span","","")); t.appendChild(el("span","",""));
    b.appendChild(t);
    log.appendChild(b);
    log.scrollTop = log.scrollHeight;
  }
  function hideTyping(){
    var b = $("jtypingBubble");
    if(b) b.remove();
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
      chat.draft = null;
      chat.draftWeek = null;
      acts.innerHTML = "";
      acts.appendChild(el("span","chip green","confirmed"));
      onConfirm();
    }));
    acts.appendChild(btn("Cancel","btn sm", function(){
      chat.pending = null;
      chat.draft = null;
      chat.draftWeek = null;
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
    botSay("bot","A few things I can do: log your hours (<span class=\"num\">2h BNK payroll testing yesterday</span>), log for someone on your team (<span class=\"num\">4h for João today</span>), check the week or your absences, copy last week, apply high-confidence suggestions, submit the week, approve timesheets, or jump to Team, Approval or CATS mapping. Just say it in plain language.", null, true);
    botChips(["How many hours do I have?","My absences","Copy last week","Submit the week"]);
  }
  function goToScreen(key, label){
    var b = document.querySelector('.nav button[data-screen="'+key+'"]');
    if(b) b.click();
    botSay("bot","Switched to "+label+".");
  }
  function goToTeamScreen(){ goToScreen("team","Team (mass entry)"); }
  function goToApprovalScreen(){ goToScreen("aprov","Approval (manager)"); }
  function goToCatsScreen(){ goToScreen("cats","CATS mapping"); }
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
    if(state.submitted){
      botSay("bot", "The week is already submitted, I can't change it. Want to see something else?");
      return;
    }
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
    if(!periodOpen(WORKDATES[day])){
      botSay("bot", DAYS[day] + " falls in a closed period, it can't take new hours. I didn't record anything.");
      return;
    }
    var livre = capacity(day) - dayTotal(day);
    var warn = null;
    if(dur > livre){
      warn = "This entry leaves the day at " + fmt(dayTotal(day) + dur) + " h, above the capacity of " + fmt(capacity(day)) + " h. It will raise an error at submission.";
    }
    chat.pending = "entry";
    chat.draft = {day:day, dur:dur, p:pIdx, desc:desc};
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
      flashCell(row.id, day);
      botSay("bot", fmt(dur) + " h saved on " + DAYS[day] + ", " + pr.code + ". " + weekSummaryText());
      botChips(["Submit the week","My absences"]);
    }, warn));
  }
  /* Same idea as offerEntry, but for "8h RTL-TT all days this week": one
     duration, repeated on every working day, skipping days with an approved
     absence instead of shifting the whole request like offerEntry does for a
     single blocked day. */
  function offerEntryWeek(days, dur, pIdx, desc){
    var pr = PROJECTS[pIdx];
    if(state.submitted){
      botSay("bot", "The week is already submitted, I can't change it. Want to see something else?");
      return;
    }
    var applicable = days.filter(function(d){ return !isBlocked(d) && periodOpen(WORKDATES[d]); });
    var blocked = days.filter(function(d){ return isBlocked(d); });
    var closed = days.filter(function(d){ return !isBlocked(d) && !periodOpen(WORKDATES[d]); });
    if(!applicable.length){
      botSay("bot","Every day in that range has an approved absence or falls in a closed period. I didn't record anything.");
      return;
    }
    var over = applicable.filter(function(d){ return dur > capacity(d) - dayTotal(d); });
    var warn = over.length
      ? "This leaves " + over.map(function(d){ return DAYS[d]; }).join(", ") + " above capacity. It will raise an error at submission."
      : null;
    var skippedLabel = blocked.map(function(d){ return DAYS[d]; }).concat(closed.map(function(d){ return DAYS[d]; })).join(", ");
    var daysLabel = applicable.map(function(d){ return DAYS[d]; }).join(", ")
      + ((blocked.length || closed.length) ? " (" + skippedLabel + " skipped, approved absence or closed period)" : "");

    chat.pending = "entryWeek";
    chat.draftWeek = {days:applicable, dur:dur, p:pIdx, desc:desc};
    botSay("bot","Confirm this entry?", botCard([
      ["Days", daysLabel],
      ["Duration per day", fmt(dur) + " h"],
      ["Total", fmt(dur * applicable.length) + " h"],
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
      applicable.forEach(function(d){ row.h[d] += dur; });
      render();
      applicable.forEach(function(d){ flashCell(row.id, d); });
      botSay("bot", fmt(dur) + " h saved on " + applicable.length + (applicable.length === 1 ? " day" : " days")
        + " (" + fmt(dur * applicable.length) + " h total), " + pr.code + ". " + weekSummaryText());
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
          historico: chat.history.slice(0, -1).slice(-12),
          contexto: {
            ecra_atual: {semana:"My week", team:"Team", aprov:"Approval", cats:"CATS mapping"}[state.screen] || "My week",
            projetos: PROJECTS.map(function(p,i){ return {codigo: p.code.split("-")[0], nome: p.name, indice: i}; }),
            ausencias: ABSENCES.map(function(a){ return {dia: DAYS[a.day], indice: a.day, tipo: a.type, horas: a.hours, estado: a.status}; }),
            capacidades: [0,1,2,3,4].map(function(d){ return {dia: DAYS[d], indice: d, capacidade: capacity(d), registado: dayTotal(d)}; }),
            semana: {total: weekTotal(), esperado: weekCapacity(), erros: errors().length, submetida: state.submitted},
            semanas_anteriores: WEEKS.slice(0, weekIdx).map(function(w){
              var porProjeto = {};
              w.rows.forEach(function(r){
                var tot = r.h.reduce(function(a,b){ return a+(b||0); }, 0);
                if(!tot) return;
                var code = PROJECTS[r.p].code.split("-")[0];
                porProjeto[code] = (porProjeto[code] || 0) + tot;
              });
              return {
                semana: w.num,
                submetida: w.submitted,
                projetos: Object.keys(porProjeto).map(function(c){ return {codigo:c, horas: round15(porProjeto[c])}; }),
                ausencias: w.absences.map(function(a){ return {tipo:a.type, horas:a.hours, estado:a.status}; })
              };
            }),
            projeto_equipa_ativo: (function(){
              var p = PROJECTS[massProject()];
              return p ? {codigo: p.code.split("-")[0], nome: p.name} : null;
            })(),
            projetos_do_lider: projectsOf(state.leader).map(function(i){
              return {codigo: PROJECTS[i].code.split("-")[0], nome: PROJECTS[i].name};
            }),
            equipa: teamOf(state.leader).map(function(m){
              return {
                nome: m.name, aprovado_bloqueado: !!m.locked,
                projetos: m.projs.map(function(i){ return PROJECTS[i].code.split("-")[0]; }),
                dias_uteis_sem_horas: missingWeekdaysFor(m).map(function(d){ return DAYS[d]; })
              };
            }),
            aprovacoes: state.approvals.map(function(a){ return {nome: a.who, tem_excecao: !!a.warn, nota: a.note || null, aprovado: !!a.approved}; }),
            pedido_por_confirmar: chat.pending === "entry" && chat.draft
              ? {dia: DAYS[chat.draft.day], duracao_horas: chat.draft.dur, projeto: PROJECTS[chat.draft.p].code.split("-")[0], descricao: chat.draft.desc}
              : null
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

  /* Claude reads teamOf(state.leader) too (the 'equipa' list in its
     context), scoped to whichever leader and project are currently active
     above the Team grid - so a name it names correctly can still fail to
     resolve here if Acting as / Project moved on since, and "couldn't
     confirm who, the days or the hours" said nothing about which, or why.
     This says which part is missing and, for the person specifically,
     names the likely cause: right person, wrong Acting as / Project. */
  function teamActionProblem(pessoaArg, hasTarget, hasDays, hasAmount, amountLabel){
    var missing = [];
    if(!hasTarget){
      var name = String(pessoaArg || "").trim();
      missing.push(name
        ? "não encontrei \"" + name + "\" na equipa de " + PROJECTS[massProject()].code + " (" + leaderById(state.leader).name + "). Se está noutro projeto ou com outro líder, muda o seletor \"Acting as\" ou \"Project\" no topo do ecrã Team primeiro"
        : "não percebi de quem se trata");
    }
    if(!hasDays) missing.push("não percebi o dia");
    if(!hasAmount) missing.push("não percebi " + amountLabel);
    return missing.join("; ") + ".";
  }
  /* maps Claude's response (function + arguments) to the same bot actions */
  function botDispatch(intent){
    switch(intent.funcao){
      case "listar_ausencias": showAbsences(); return true;
      case "consultar_semana": showWeekStatus(); return true;
      case "aplicar_sugestoes": offerApplyHighConfidence(); return true;
      case "ir_para_equipa": goToTeamScreen(); return true;
      case "ir_para_aprovacao": goToApprovalScreen(); return true;
      case "ir_para_cats": goToCatsScreen(); return true;
      case "copiar_semana": offerCopyWeek(); return true;
      case "submeter_semana": offerSubmit(); return true;
      case "registar_horas_equipa":
        var ae = intent.argumentos || {};
        var teamMembersE = teamOf(state.leader);
        var targetsE = /^(todos|toda a equipa|equipa toda)$/i.test(String(ae.pessoa || "").trim())
          ? teamMembersE
          : teamMembersE.filter(function(m){ return m.name.toLowerCase().indexOf(String(ae.pessoa || "").toLowerCase()) !== -1; });
        var rawDaysE = Array.isArray(ae.dias) && ae.dias.length ? ae.dias : (ae.dia ? [ae.dia] : []);
        var daysE = rawDaysE
          .map(function(d){ return resolveDayArg(d); })
          .filter(function(i){ return i !== -1; });
        var clockE = null;
        if(ae.hora_inicio && ae.hora_fim){
          var bE = parseClock(ae.hora_inicio), eE = parseClock(ae.hora_fim);
          if(!isNaN(bE) && bE !== null && !isNaN(eE) && eE !== null) clockE = {b:bE, e:eE};
        }
        var durE = clockE ? null : round15(Number(ae.duracao_horas));
        var hasAmountE = !!(clockE || (durE && durE > 0));
        if(!targetsE.length || !daysE.length || !hasAmountE){
          botSay("bot", intent.texto || teamActionProblem(ae.pessoa, targetsE.length > 0, daysE.length > 0, hasAmountE, "as horas"));
          botChips(["Help"]);
          return true;
        }
        offerTeamEntry(targetsE, daysE, durE, clockE);
        return true;
      case "preencher_horas_em_falta_equipa":
        var fp = intent.argumentos || {};
        var durFp = round15(Number(fp.duracao_horas));
        offerFillMissingTeam(fp.pessoa, (durFp && durFp > 0) ? durFp : 8);
        return true;
      case "aprovar":
        var aa = intent.argumentos || {};
        var isAll = /^(todos|toda a equipa|equipa toda)$/i.test(String(aa.pessoa || "").trim());
        handleApprovalRequest(isAll ? "approve everyone" : "approve " + String(aa.pessoa || ""));
        return true;
      case "registar_allowance_equipa":
        var al = intent.argumentos || {};
        var teamMembersAl = teamOf(state.leader);
        var targetsAl = /^(todos|toda a equipa|equipa toda)$/i.test(String(al.pessoa || "").trim())
          ? teamMembersAl
          : teamMembersAl.filter(function(m){ return m.name.toLowerCase().indexOf(String(al.pessoa || "").toLowerCase()) !== -1; });
        var wAl = wt(al.rubrica);
        var rawDaysAl = Array.isArray(al.dias) && al.dias.length ? al.dias : (al.dia ? [al.dia] : []);
        var daysAl = rawDaysAl.map(function(d){ return resolveDayArg(d); }).filter(function(i){ return i !== -1; });
        var qtyAl = round15(Number(al.quantidade));
        var hasAmountAl = !!(qtyAl && qtyAl > 0);
        if(!targetsAl.length || !wAl || !daysAl.length || !hasAmountAl){
          var msgAl = intent.texto || teamActionProblem(al.pessoa, targetsAl.length > 0, daysAl.length > 0, hasAmountAl, "a quantidade");
          if(!intent.texto && !wAl) msgAl += " Também não reconheci a rubrica.";
          botSay("bot", msgAl);
          botChips(["Help"]);
          return true;
        }
        offerTeamAllowance(targetsAl, daysAl, al.rubrica, qtyAl, String(al.nota || "").trim());
        return true;
      case "registar_horas":
        var a = intent.argumentos || {};
        var dayIdx = resolveDayArg(a.dia);
        var pIdx = -1;
        PROJECTS.forEach(function(pr,i){
          if(pr.code.toLowerCase().indexOf(String(a.projeto || "").toLowerCase()) === 0) pIdx = i;
        });
        var dur = round15(Number(a.duracao_horas));
        if(dayIdx === -1 || dayIdx > 4 || pIdx === -1 || !dur || dur <= 0){
          botSay("bot", intent.texto || "Não consegui confirmar todos os detalhes desse registo. Pode escrever de outra forma?");
          botChips(["How many hours do I have?","My absences"]);
          return true;
        }
        offerEntry(dayIdx, dur, pIdx, a.descricao || "");
        return true;
      case "registar_horas_semana":
        var aw = intent.argumentos || {};
        var pIdxW = -1;
        PROJECTS.forEach(function(pr,i){
          if(pr.code.toLowerCase().indexOf(String(aw.projeto || "").toLowerCase()) === 0) pIdxW = i;
        });
        var durW = round15(Number(aw.duracao_horas));
        if(pIdxW === -1 || !durW || durW <= 0){
          botSay("bot", intent.texto || "Não consegui confirmar todos os detalhes desse registo. Pode escrever de outra forma?");
          botChips(["How many hours do I have?","My absences"]);
          return true;
        }
        offerEntryWeek([0,1,2,3,4], durW, pIdxW, aw.descricao || "");
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
    chat.history.push({role:"user", content:txt});
    showTyping();

    /* A card is already open waiting for confirmation: read this message as
       a correction to it first (checked here, ahead of Claude, so it holds
       even when the language model isn't configured or doesn't pick up on
       the open card from context alone). */
    if(chat.pending === "entry" && chat.draft){
      var fix = tryCorrectDraft(txt);
      if(fix){
        await thinkingDelay();
        hideTyping();
        offerEntry(fix.day, fix.dur, fix.p, fix.desc);
        chat.history.push({role:"assistant", content:"Updated the pending entry: " + fmt(fix.dur) + "h, " + PROJECTS[fix.p].name + ", " + DAYS[fix.day] + "."});
        return;
      }
    }

    var intentP = askAssistant(txt);
    var intent = (await Promise.all([intentP, thinkingDelay()]))[0];
    hideTyping();
    if(intent && botDispatch(intent)){
      chat.history.push({role:"assistant", content: intent.texto || ("Called " + intent.funcao + ".")});
      return;
    }

    botHandleLocal(txt);
  }

  /* local regex interpreter, used when Claude isn't configured or fails.
     The pending-entry correction is checked earlier, in botHandle, ahead of
     Claude, so it isn't repeated here. */
  function botHandleLocal(txt){
    var t = txt.toLowerCase();

    /* greeting, no task in it: a short human reply, not the parsing-failure
       message. Checked as a whole-message match so "hi, log 2h BNK today"
       still falls through to the real parsers below. */
    if(/^\s*(hi|hello|hey|hiya|good (morning|afternoon|evening)|ol[aá]|oi|bom dia|boa tarde|boa noite)[!.,\s]*$/i.test(txt)){
      var greetings = [
        "Hey! What do you need, logging hours, checking the week, or something else?",
        "Hi there. Tell me what you need and I'll sort it.",
        "Hello! Hours to log, or something to check?"
      ];
      botSay("bot", greetings[Math.floor(Math.random()*greetings.length)]);
      botChips(["How many hours do I have?","My absences","Help"]);
      return;
    }
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
    /* screen navigation */
    if(/mass entry|team entry|team screen|go to team|switch to team|open team/.test(t)){ goToTeamScreen(); return; }
    if(/approval screen|go to approval|switch to approval|open approval/.test(t)){ goToApprovalScreen(); return; }
    if(/cats mapping|cats screen|go to cats|switch to cats|open cats/.test(t)){ goToCatsScreen(); return; }

    /* approve a timesheet, or the whole clean batch, from the Approval
       screen's data, checked ahead of the self-entry parser since "approve"
       never means a time entry */
    if(/\bapprove\b/.test(t)){ handleApprovalRequest(txt); return; }

    /* log hours or an allowance for someone else's team, checked ahead of
       the self-entry and whole-week parsers since a named target should
       never be read as an entry for the person typing. Allowance first,
       since a distinctive wage-type word ("per diem", "km") is a much
       safer signal than the bare-number fallback the hours parser falls
       back to, which would otherwise misread "2 km" as "2 hours". */
    var teamMembers = teamOf(state.leader);
    var ta = botParseTeamAllowance(txt, teamMembers);
    if(ta){ offerTeamAllowance(ta.members, ta.days, ta.code, ta.qty, ta.note); return; }

    var tp = botParseTeamHours(txt, teamMembers);
    if(tp){ offerTeamEntry(tp.members, tp.days, tp.dur, tp.clock); return; }

    /* a request for every working day ("8h RTL-TT all days this week"),
       checked ahead of the single-day parser since it matches a duration
       and a project too and would otherwise just default to "today" */
    if(ALL_WEEK_RE.test(t)){
      var pw = botParseWeek(txt);
      if(pw){
        offerEntryWeek(pw.days, pw.dur, pw.p, pw.desc);
        chat.history.push({role:"assistant", content:"Proposed " + fmt(pw.dur) + "h/day, " + PROJECTS[pw.p].name + ", every working day this week. Waiting for confirmation."});
        return;
      }
    }

    /* time entry, reuses the same parser as quick add */
    var p = botParse(txt);
    if(!p){
      botSay("bot","I couldn't understand what to record. Write the duration and the project, for example <span class=\"num\">2h BNK payroll testing yesterday</span>. I can also show the week's status or your absences.", null, true);
      botChips(["How many hours do I have?","My absences","Help"]);
      chat.history.push({role:"assistant", content:"Couldn't parse a duration and project from that message."});
      return;
    }
    offerEntry(p.day, p.dur, p.p, p.desc);
    chat.history.push({role:"assistant", content:"Proposed an entry: " + fmt(p.dur) + "h, " + PROJECTS[p.p].name + ", " + DAYS[p.day] + ". Waiting for confirmation."});
  }

  /* Weekday names and "yesterday"/"today" only cover a relative reading of
     the visible week. A calendar date ("September 15", "15 Sep", "15/09")
     needs to be matched against WORKDATES instead. Returns the day index if
     the date falls in the visible week, -1 if it's a real date outside it,
     or null if nothing date-shaped was found at all. */
  var MONTHS_NLP = ["january","february","march","april","may","june","july","august","september","october","november","december"];
  /* Finds the WORKDATES index whose day-of-month matches dd, and whose
     month matches mm when mm is given; -1 when nothing in the visible week
     fits. parseDateMention, resolveDayArg and matchDaysMention each used
     to run this same loop with their own slightly different copy. */
  function workdateIndexFor(dd, mm){
    for(var i=0; i<WORKDATES.length; i++){
      if(+WORKDATES[i].slice(6,8) === dd && (mm == null || +WORKDATES[i].slice(4,6) === mm)) return i;
    }
    return -1;
  }
  function parseDateMention(rest){
    var m, dd, mm;
    if((m = rest.match(/\b(\d{1,2})[\/\-](\d{1,2})\b/))){ dd = +m[1]; mm = +m[2]; }
    else if((m = rest.match(new RegExp("\\b("+MONTHS_NLP.join("|")+")\\s+(\\d{1,2})\\b","i")))){ mm = MONTHS_NLP.indexOf(m[1].toLowerCase())+1; dd = +m[2]; }
    else if((m = rest.match(new RegExp("\\b(\\d{1,2})\\s+("+MONTHS_NLP.join("|")+")\\b","i")))){ dd = +m[1]; mm = MONTHS_NLP.indexOf(m[2].toLowerCase())+1; }
    else return null;
    return {day: workdateIndexFor(dd, mm), match:m[0]};
  }

  /* Resolves a day argument coming back from Claude's tool call, which isn't
     always the clean YYYY-MM-DD the tool schema asks for (a bare "15", a
     "2026-9-15" with unpadded month, "15/09"). Tries, in order: exact ISO
     match against WORKDATES, a calendar-date mention via parseDateMention,
     then a bare day-of-month number against the visible week. Returns -1
     when nothing in the visible week matches. */
  function resolveDayArg(dia){
    var s = String(dia == null ? "" : dia).trim();
    if(!s) return -1;
    var digits = s.replace(/[-\/]/g,"");
    var idx = WORKDATES.indexOf(digits);
    if(idx !== -1) return idx;
    var dm = parseDateMention(" " + s + " ");
    if(dm && dm.day !== -1) return dm.day;
    var bare = s.match(/^(\d{1,2})$/);
    if(bare) return workdateIndexFor(+bare[1]);
    return -1;
  }

  /* Duration token: "8h", "8 hours", "1:30", "90m" or a bare number, matched
     as a WHOLE token so nothing leaks into the description afterwards — the
     bare "h" pattern used to match only "8 h" out of "8 hours" and leave
     "ours" behind in the text. */
  function matchDuration(rest){
    var m;
    if((m = rest.match(/(\d+(?:[.,]\d+)?)\s*h(?:ours?|rs?)?\b/i))) return {dur:parseDur(m[1]), match:m[0]};
    if((m = rest.match(/(\d{1,2}):(\d{2})\b/))) return {dur:parseDur(m[0]), match:m[0]};
    if((m = rest.match(/(\d+)\s*m(?:in(?:ute)?s?)?\b/i))) return {dur:parseDur(m[1]+"m"), match:m[0]};
    if((m = rest.match(/\s(\d+(?:[.,]\d+)?)\s/))) return {dur:parseDur(m[1]), match:m[0]};
    return null;
  }
  /* Project code, plus any WBS suffix attached to it ("RTL-TT.2.1"), so that
     doesn't leak into the description either. */
  function matchProject(rest){
    var found = null;
    PROJECTS.forEach(function(pr,i){
      var key = pr.code.split("-")[0];
      var m = rest.match(new RegExp("\\b"+key+"[\\w.\\-]*","i"));
      if(m) found = {p:i, match:m[0]};
    });
    return found;
  }
  var ALL_WEEK_RE = /\ball\s+days?\b|\bevery\s+day\b|\beach\s+day\b|\ball\s+week\b|\bwhole\s+week\b|\bfor\s+the\s+week\b/i;

  /* Weekday token, "yesterday"/"today", or a calendar date, whichever is
     found first. Returns null (no mention at all, caller keeps its own
     default) or {day, match}, where day is -1 for a real date outside the
     visible week, a signal the caller should treat as "can't place this". */
  function matchDayMention(rest){
    var m;
    if((m = rest.match(/\byesterday\b/i))) return {day:1, match:m[0]};
    if((m = rest.match(/\btoday\b/i))) return {day:2, match:m[0]};
    var names = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"];
    for(var i=0; i<names.length; i++){
      var re = new RegExp("\\b("+names[i]+")\\b","i");
      if((m = rest.match(re))) return {day:i, match:m[0]};
    }
    var dmDate = parseDateMention(rest);
    if(dmDate) return dmDate;
    return null;
  }

  /* assistant parser: duration, day and project */
  function botParse(txt){
    var rest = " " + txt + " ";
    var dm = matchDuration(rest);
    if(!dm || dm.dur <= 0) return null;
    rest = rest.replace(dm.match," ");

    var day = 2;
    var dayM = matchDayMention(rest);
    if(dayM){
      if(dayM.day === -1) return null;
      day = dayM.day;
      rest = rest.replace(dayM.match," ");
    }
    var pm = matchProject(rest);
    if(!pm) return null;
    rest = rest.replace(pm.match," ");
    return {dur:round15(dm.dur), day:day, p:pm.p, desc:rest.replace(/\s+/g," ").trim()};
  }

  /* "log 8h for João today" / "record 4h for everyone tomorrow": a mass
     entry made through the assistant instead of the Team screen's own
     form. Only fires when a colleague's name or "everyone"/"the team" is
     explicitly present, so a normal self-entry never gets misread as one. */
  function matchTeamTargets(rest, members){
    var m = rest.match(/\bfor\s+(everyone|the\s+whole\s+team|the\s+team|all)\b/i);
    if(m) return {list:members, match:m[0]};
    for(var i=0; i<members.length; i++){
      var first = members[i].name.split(" ")[0];
      var re = new RegExp("\\bfor\\s+(the\\s+)?"+first+"\\b","i");
      if((m = rest.match(re))) return {list:[members[i]], match:m[0]};
    }
    return null;
  }
  /* "from 08:00 till 14:00" / "08:00 to 14h00": a clock window, for
     Z_BSRV people, read before falling back to a plain duration so it
     isn't misread as one (a bare "08:00" would otherwise parse as an
     8-hour duration through matchDuration's H:MM pattern). */
  function matchClockRange(rest){
    var m = rest.match(/\bfrom\s+(\d{1,2}(?:[:.h]\d{2})?)\s*(?:to|till|until|-|–)\s*(\d{1,2}(?:[:.h]\d{2})?)\b/i);
    if(!m) return null;
    var b = parseClock(m[1]), e = parseClock(m[2]);
    if(b === null || e === null || isNaN(b) || isNaN(e)) return null;
    return {b:b, e:e, match:m[0]};
  }

  /* "September 16, 17 and 18" / "Monday, Tuesday and Wednesday": more than
     one day in the same request. Falls back to matchDayMention (single
     day, or today by default) when no list is found. */
  function matchDaysMention(rest){
    var monthListRe = new RegExp("\\b("+MONTHS_NLP.join("|")+")\\s+(\\d{1,2}(?:\\s*(?:,|and)\\s*\\d{1,2})*)\\b","i");
    var mm = rest.match(monthListRe);
    if(mm){
      var month = MONTHS_NLP.indexOf(mm[1].toLowerCase())+1;
      var nums = mm[2].match(/\d{1,2}/g).map(Number);
      var days = [];
      nums.forEach(function(dd){
        var i = workdateIndexFor(dd, month);
        if(i !== -1) days.push(i);
      });
      if(days.length) return {days:days};
    }
    var names = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"];
    var found = [];
    names.forEach(function(n,i){
      var re = new RegExp("\\b"+n+"\\b","gi"), m2;
      while((m2 = re.exec(rest))) found.push({i:i, idx:m2.index});
    });
    if(found.length){
      found.sort(function(a,b){ return a.idx - b.idx; });
      var seen = {}, days2 = [];
      found.forEach(function(f){ if(!seen[f.i]){ seen[f.i] = true; days2.push(f.i); } });
      return {days:days2};
    }
    var single = matchDayMention(rest);
    if(single) return single.day === -1 ? {invalid:true} : {days:[single.day]};
    return null;
  }

  function botParseTeamHours(txt, members){
    var rest = " " + txt + " ";
    var clock = matchClockRange(rest);
    var dm = null;
    if(clock){ rest = rest.replace(clock.match," "); }
    else {
      dm = matchDuration(rest);
      if(!dm || dm.dur <= 0) return null;
      rest = rest.replace(dm.match," ");
    }

    var tgt = matchTeamTargets(rest, members);
    if(!tgt) return null;
    rest = rest.replace(tgt.match," ");

    var dmn = matchDaysMention(rest);
    if(dmn && dmn.invalid) return null;
    var days = dmn ? dmn.days : [2];
    return {members:tgt.list, days:days, dur: clock ? null : round15(dm.dur), clock:clock};
  }

  /* Drives the same form the Team screen's "Fill several people at once"
     panel uses (project, duration or start/end, day checkboxes, then
     Apply and Save), so a chat-staged entry goes through exactly the same
     validation as a manually staged one, mixed clock/duration teams and
     absences/closed periods included, instead of a second copy of that
     logic that could drift from the real one. */
  function offerTeamEntry(members, days, dur, clock){
    var pIdx = massProject();
    var pr = PROJECTS[pIdx];
    var locked = members.filter(function(m){ return m.locked; });
    var selected = members.filter(function(m){ return !m.locked; });
    if(!selected.length){
      botSay("bot","Can't stage that: " + locked.map(function(m){ return m.name.split(" ")[0] + " (week already approved)"; }).join(", ") + ".");
      botChips(["How many hours do I have?","Help"]);
      return;
    }
    var dayLabel = days.map(function(d){ return DAYS[d]; }).join(", ");
    var amountLabel = clock ? (fmtClock(clock.b) + "–" + fmtClock(clock.e)) : (fmt(dur) + " h");
    var lines = [
      ["People", selected.map(function(m){ return m.name; }).join(", ")],
      ["Days", dayLabel],
      [clock ? "Time" : "Duration each", amountLabel],
      ["Project", pr.name]
    ];
    if(locked.length) lines.push(["Skipped", locked.map(function(m){ return m.name.split(" ")[0] + " (week already approved)"; }).join(", ")]);
    botSay("bot","Stage and save this?", botCard(lines, "Stage and save", function(){
      teamOf(state.leader).forEach(function(m){ stagedOf(m.pernr).sel = false; });
      selected.forEach(function(m){ stagedOf(m.pernr).sel = true; });
      if($("mDur")) $("mDur").value = clock ? "" : String(dur);
      if($("mBeg")) $("mBeg").value = clock ? fmtClock(clock.b) : "";
      if($("mEnd")) $("mEnd").value = clock ? fmtClock(clock.e) : "";
      Array.prototype.forEach.call(document.querySelectorAll(".mHoursDays input"), function(c){
        c.checked = days.indexOf(+c.value) !== -1;
      });
      var beforeLog = state.massLog.length;
      applyMass();
      saveMass(selected.map(function(m){ return m.pernr; }));
      var savedPernrs = {};
      state.massLog.slice(beforeLog).forEach(function(e){ savedPernrs[e.pernr] = true; });
      var saved = selected.filter(function(m){ return savedPernrs[m.pernr]; }).map(function(m){ return m.name.split(" ")[0]; });
      var notSaved = selected.filter(function(m){ return !savedPernrs[m.pernr]; }).map(function(m){ return m.name.split(" ")[0]; });
      var msg = saved.length
        ? "Staged and saved for " + saved.join(", ") + ", " + dayLabel + ", " + pr.code + "."
        : "Nothing was actually saved.";
      if(notSaved.length) msg += " " + notSaved.join(", ") + " couldn't take it this way (not allocated to " + pr.code + ", wrong profile for that field, absence, or closed period), the reason is on the Team screen.";
      botSay("bot", msg);
      botChips(["How many hours do I have?","Help"]);
    }));
    chat.history.push({role:"assistant", content:"Proposed " + amountLabel + " on " + dayLabel + " for " + selected.map(function(m){return m.name;}).join(", ") + ". Waiting for confirmation."});
  }

  /* "a per diem for João today" / "2 km for everyone Mon and Tue": the same
     mass-entry idea as offerTeamEntry, but for allowances, driving the Team
     screen's own Allowances form (#mAllowCode/#mAllowQty/#mAllowNote/
     .mAllowDays) and its real applyMassAllow()/saveMassAllow(), so mixed
     companies, missing required notes and closed periods are handled the
     same way a person clicking through the screen would hit them. */
  var ALLOWANCE_TYPES = [
    {code:"AJC_INT", re:/\bforeign\s*per\s*diem\b/i},
    {code:"AJC_NAC", re:/\bper\s*diem\b|\bdaily\s*allowance\b/i},
    {code:"KMS", re:/\bkil?ometh?res?\b|\bkilometers?\b|\bkms?\b|\bmileage\b/i},
    {code:"TURNO", re:/\bshift\s*allowance\b|\bshift\b/i}
  ];
  function matchAllowanceType(rest){
    for(var i=0; i<ALLOWANCE_TYPES.length; i++){
      var m = rest.match(ALLOWANCE_TYPES[i].re);
      if(m) return {code:ALLOWANCE_TYPES[i].code, match:m[0]};
    }
    return null;
  }
  function matchQty(rest){
    var m;
    if((m = rest.match(/(\d+(?:[.,]\d+)?)\s*(?:km|kilometres?|kilometers?)\b/i))) return {qty:parseDur(m[1]), match:m[0]};
    if((m = rest.match(/(\d+(?:[.,]\d+)?)\s*days?\b/i))) return {qty:parseDur(m[1]), match:m[0]};
    if((m = rest.match(/\s(\d+(?:[.,]\d+)?)\s/))) return {qty:parseDur(m[1]), match:m[0]};
    return null;
  }
  function botParseTeamAllowance(txt, members){
    var rest = " " + txt + " ";
    var typ = matchAllowanceType(rest);
    if(!typ) return null;
    rest = rest.replace(typ.match," ");

    var tgt = matchTeamTargets(rest, members);
    if(!tgt) return null;
    rest = rest.replace(tgt.match," ");

    var qm = matchQty(rest);
    var qty = qm ? round15(qm.qty) : 1;
    if(qm) rest = rest.replace(qm.match," ");

    var dmn = matchDaysMention(rest);
    if(dmn && dmn.invalid) return null;
    var days = dmn ? dmn.days : [2];

    /* Whatever's left after type/target/qty could be a real note (KMS's
       "Lisbon to Porto", AJC_INT's country) or just filler ("log", "today",
       a leftover weekday) the day parsing above didn't consume since, unlike
       the other matchers, matchDaysMention doesn't report back what it
       matched. Strip the usual filler so a bare "log today" doesn't get
       mistaken for a genuine note and skip the required-field check below. */
    var weekdayNames = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"];
    var note = rest
      .replace(/\b(log|record|add|please|stage|enter|on|this|the)\b/gi," ")
      .replace(/\b(today|yesterday)\b/gi," ")
      .replace(new RegExp("\\b("+weekdayNames.join("|")+")\\b","gi")," ")
      .replace(new RegExp("\\b("+MONTHS_NLP.join("|")+")\\b","gi")," ")
      .replace(/\b\d{1,2}\b/g," ")
      .replace(/^[\s,]+|[\s,]+$/g,"")
      .replace(/\s+/g," ")
      .trim();

    return {members:tgt.list, days:days, code:typ.code, qty:qty, note:note};
  }
  function offerTeamAllowance(members, days, code, qty, note){
    var w = wt(code);
    var locked = members.filter(function(m){ return m.locked; });
    var selected = members.filter(function(m){ return !m.locked; });
    if(!selected.length){
      botSay("bot","Can't stage that: " + locked.map(function(m){ return m.name.split(" ")[0] + " (week already approved)"; }).join(", ") + ".");
      botChips(["Help"]);
      return;
    }
    if(w.noteLabel && !note){
      botSay("bot", w.noteLabel + " is required for " + w.name + ". What should it say?");
      botChips(["Help"]);
      return;
    }
    var dayLabel = days.map(function(d){ return DAYS[d]; }).join(", ");
    var lines = [
      ["People", selected.map(function(m){ return m.name; }).join(", ")],
      ["Days", dayLabel],
      ["Wage type", w.name],
      ["Quantity each", fmt(qty) + " " + w.unit]
    ];
    if(note) lines.push([w.noteLabel || "Note", note]);
    if(locked.length) lines.push(["Skipped", locked.map(function(m){ return m.name.split(" ")[0] + " (week already approved)"; }).join(", ")]);
    botSay("bot","Stage and save this?", botCard(lines, "Stage and save", function(){
      teamOf(state.leader).forEach(function(m){ stagedOf(m.pernr).sel = false; });
      selected.forEach(function(m){ stagedOf(m.pernr).sel = true; });
      if($("mAllowCode")){ $("mAllowCode").value = code; syncMassAllowForm(); }
      if($("mAllowQty")) $("mAllowQty").value = String(qty);
      if($("mAllowNote")) $("mAllowNote").value = note || "";
      Array.prototype.forEach.call(document.querySelectorAll(".mAllowDays input"), function(c){
        c.checked = days.indexOf(+c.value) !== -1;
      });
      var beforeLog = state.massLog.length;
      applyMassAllow();
      saveMassAllow(selected.map(function(m){ return m.pernr; }));
      var savedPernrs = {};
      state.massLog.slice(beforeLog).forEach(function(e){ savedPernrs[e.pernr] = true; });
      var saved = selected.filter(function(m){ return savedPernrs[m.pernr]; }).map(function(m){ return m.name.split(" ")[0]; });
      var notSaved = selected.filter(function(m){ return !savedPernrs[m.pernr]; }).map(function(m){ return m.name.split(" ")[0]; });
      var msg = saved.length
        ? "Staged and saved for " + saved.join(", ") + ", " + dayLabel + ", " + w.name + "."
        : "Nothing was actually saved.";
      if(notSaved.length) msg += " " + notSaved.join(", ") + " couldn't take it (not allocated to " + PROJECTS[massProject()].code + ", wrong company for that allowance, or closed period).";
      botSay("bot", msg);
      botChips(["How many hours do I have?","Help"]);
    }));
    chat.history.push({role:"assistant", content:"Proposed " + fmt(qty) + " " + w.unit + " " + w.name + " on " + dayLabel + " for " + selected.map(function(m){return m.name;}).join(", ") + ". Waiting for confirmation."});
  }

  /* "fill in whoever's missing hours" / "complete the team's week": unlike
     every other mass entry, this one can't share a single day set across
     everyone, since each person's gaps are their own. Computes
     missingWeekdaysFor() per person, so someone on Tue and Wed alone
     doesn't also get filled on Thu just because a teammate was free then. */
  function offerFillMissingTeam(pessoaArg, dur){
    var members = teamOf(state.leader).filter(function(m){ return !m.locked; });
    var name = String(pessoaArg || "").trim().toLowerCase();
    var matched = name ? members.filter(function(m){ return m.name.toLowerCase().indexOf(name) !== -1; }) : members;
    var plan = matched.map(function(m){ return {member:m, days:missingWeekdaysFor(m)}; })
      .filter(function(p){ return p.days.length; });
    if(!plan.length){
      var msg;
      if(!name) msg = "Ninguém na equipa de " + PROJECTS[massProject()].code + " tem dias úteis por preencher esta semana.";
      else if(matched.length) msg = matched.map(function(m){ return m.name; }).join(", ") + " já tem todos os dias úteis desta semana preenchidos, na equipa de " + PROJECTS[massProject()].code + ".";
      else msg = "Não encontrei ninguém chamada \"" + pessoaArg + "\" na equipa de " + PROJECTS[massProject()].code + ".";
      botSay("bot", msg);
      botChips(["Help"]);
      return;
    }
    var startMin = parseClock("08:00");
    var clockWindow = {b:startMin, e:startMin + dur*60};
    var lines = plan.map(function(p){
      return [p.member.name, p.days.map(function(d){ return DAYS[d]; }).join(", ")];
    });
    lines.push(["Duração por dia", fmt(dur) + " h"]);
    lines.push(["Projeto", PROJECTS[massProject()].code]);
    botSay("bot", "Preencher estes dias em falta com " + fmt(dur) + " h cada?", botCard(lines, "Preencher e gravar", function(){
      teamOf(state.leader).forEach(function(m){ stagedOf(m.pernr).sel = false; });
      plan.forEach(function(p){
        var st = stagedOf(p.member.pernr);
        st.sel = true;
        var clock = profileFor(WORKDATES[0], p.member.bukrs).clock;
        p.days.forEach(function(d){
          if(clock){ st.t[d] = {b:clockWindow.b, e:clockWindow.e}; st.h[d] = slotHours(st.t[d]); }
          else { st.t[d] = null; st.h[d] = dur; }
        });
      });
      var beforeLog = state.massLog.length;
      saveMass(plan.map(function(p){ return p.member.pernr; }));
      var savedPernrs = {};
      state.massLog.slice(beforeLog).forEach(function(e){ savedPernrs[e.pernr] = true; });
      var saved = plan.filter(function(p){ return savedPernrs[p.member.pernr]; }).map(function(p){ return p.member.name.split(" ")[0]; });
      var notSaved = plan.filter(function(p){ return !savedPernrs[p.member.pernr]; }).map(function(p){ return p.member.name.split(" ")[0]; });
      var msg = saved.length
        ? "Preenchido e gravado para " + saved.join(", ") + "."
        : "Nada foi gravado.";
      if(notSaved.length) msg += " " + notSaved.join(", ") + " não foi possível, o motivo fica na grelha da equipa.";
      botSay("bot", msg);
      botChips(["Help"]);
    }));
    chat.history.push({role:"assistant", content:"Proposto preencher dias em falta (" + fmt(dur) + "h/dia) para " + plan.map(function(p){return p.member.name;}).join(", ") + ". Aguardando confirmação."});
  }

  /* "approve João" / "approve everyone": mirrors exactly what the Approval
     screen's own checkboxes + Approve button do, never more, so an
     exception still can't be bulk-approved through the assistant either. */
  function matchApprovalTargets(txt){
    var t = txt.toLowerCase();
    if(/\b(everyone|the\s+whole\s+team|the\s+team|all)\b/.test(t)) return {all:true};
    var found = null;
    state.approvals.forEach(function(a){
      if(t.indexOf(a.who.split(" ")[0].toLowerCase()) !== -1) found = a;
    });
    return found ? {one:found} : null;
  }
  function handleApprovalRequest(txt){
    var tgt = matchApprovalTargets(txt);
    if(!tgt){
      botSay("bot","Tell me who to approve, a name, or “approve everyone” for every timesheet without exceptions.");
      botChips(["Help"]);
      return;
    }
    if(tgt.all){
      var clean = state.approvals.filter(function(a){ return !a.warn && !a.approved; });
      if(!clean.length){
        botSay("bot","Nothing to approve there, either everything's already approved or what's left has an exception that needs individual review.");
        return;
      }
      botSay("bot","Approve these " + clean.length + " timesheets, no exceptions?", botCard(
        clean.map(function(a){ return [a.who, fmt(a.tot) + " h"]; }),
        "Approve all", function(){
          clean.forEach(function(a){ a.approved = true; a.sel = false; });
          renderApprovals();
          botSay("bot", clean.length + " timesheets approved. Exceptions remain for individual review.");
          botChips(["Help"]);
        }
      ));
      return;
    }
    var a = tgt.one;
    if(a.approved){ botSay("bot", a.who + "'s timesheet is already approved."); return; }
    if(a.warn){
      botSay("bot", a.who + "'s timesheet has an exception (" + a.note + ") and needs individual review on the Approval screen, that one can't be bulk-approved.");
      return;
    }
    botSay("bot","Approve " + a.who + "'s timesheet?", botCard([
      ["Project", a.proj], ["Total", fmt(a.tot) + " h"], ["In project", fmt(a.inproj) + " h"]
    ], "Approve", function(){
      a.approved = true; a.sel = false;
      renderApprovals();
      botSay("bot", a.who + "'s timesheet approved.");
      botChips(["Help"]);
    }));
  }

  /* Same reading as botParse, but for a request meant to repeat across every
     working day of the visible week ("8h RTL-TT all days this week"),
     instead of the one day botParse would default to. */
  function botParseWeek(txt){
    var rest = " " + txt + " ";
    var dm = matchDuration(rest);
    if(!dm || dm.dur <= 0) return null;
    rest = rest.replace(dm.match," ").replace(ALL_WEEK_RE," ").replace(/\bthis\s+week\b|\bthe\s+week\b/gi," ");
    var pm = matchProject(rest);
    if(!pm) return null;
    rest = rest.replace(pm.match," ");
    return {dur:round15(dm.dur), days:[0,1,2,3,4], p:pm.p, desc:rest.replace(/\s+/g," ").trim()};
  }

  /* A card is already open for chat.draft: read this message for just the
     part that changes (a different day, duration or project), and keep the
     rest of the draft as it was, instead of demanding the whole sentence
     again. Returns null if nothing recognizable was found, so the caller can
     fall through to every other interpretation. Duration deliberately skips
     the bare-number fallback matchDuration has for a fresh request: on a
     short correction like "actually September 16", that fallback would
     misread the "16" as a duration instead of leaving it to the date match. */
  function tryCorrectDraft(txt){
    var rest = " " + txt + " ", m;
    var draft = chat.draft, day = draft.day, dur = draft.dur, pIdx = draft.p, changed = false;

    if(/\byesterday\b/i.test(rest)){ day = 1; changed = true; rest = rest.replace(/\byesterday\b/i," "); }
    else if(/\btoday\b/i.test(rest)){ day = 2; changed = true; rest = rest.replace(/\btoday\b/i," "); }
    else {
      var names = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"];
      for(var i=0; i<names.length && !changed; i++){
        var re = new RegExp("\\b("+names[i]+")\\b","i");
        if(re.test(rest)){ day = i; changed = true; rest = rest.replace(re," "); }
      }
      if(!changed){
        var dm = parseDateMention(rest);
        if(dm && dm.day !== -1){ day = dm.day; changed = true; rest = rest.replace(dm.match," "); }
      }
    }

    if((m = rest.match(/(\d+(?:[.,]\d+)?)\s*h(?:ours?|rs?)?\b/i))){ dur = parseDur(m[1]); changed = true; }
    else if((m = rest.match(/(\d{1,2}):(\d{2})\b/))){ dur = parseDur(m[0]); changed = true; }
    else if((m = rest.match(/(\d+)\s*m(?:in(?:ute)?s?)?\b/i))){ dur = parseDur(m[1]+"m"); changed = true; }

    var pm = matchProject(rest);
    if(pm){ pIdx = pm.p; changed = true; }

    if(!changed) return null;
    return {day:day, dur:round15(dur), p:pIdx, desc:draft.desc};
  }

  $("jouleFab").onclick = function(){ botToggle(); };
  $("jClose").onclick = function(){ botToggle(false); };
  $("jform").onsubmit = function(ev){
    ev.preventDefault();
    if(chat.busy) return;
    var v = $("jinput").value.trim();
    if(!v) return;
    $("jinput").value = "";
    chat.busy = true;
    $("jinput").disabled = true;
    if($("jsend")) $("jsend").disabled = true;
    botHandle(v).finally(function(){
      chat.busy = false;
      $("jinput").disabled = false;
      if($("jsend")) $("jsend").disabled = false;
      $("jinput").focus();
    });
  };

  document.addEventListener("keydown", function(ev){
    var tag = (ev.target.tagName || "").toLowerCase();
    var typing = tag === "input" || tag === "textarea" || tag === "select";
    if(ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)){ ev.preventDefault(); if(!$("submitBtn").disabled) openSubmit(); return; }
    if(typing) return;
    if(document.querySelector("dialog[open]")) return;
    if(ev.key === "j" || ev.key === "J"){ ev.preventDefault(); botToggle(); }
    else if(ev.key === "n" || ev.key === "N"){ ev.preventDefault(); openQuick("", 2); }
    else if((ev.key === "c" || ev.key === "C") && !isMonthly()){ ev.preventDefault(); copyWeek(); }
    else if(ev.key === "ArrowLeft"){ ev.preventDefault(); changeWeek(-1); }
    else if(ev.key === "ArrowRight"){ ev.preventDefault(); changeWeek(1); }
    else if(ev.key === "?"){ ev.preventDefault(); $("dlgHelp").showModal(); }
  });

  /* ---------- wiring: company, allowances, team ---------- */
  (function(){
    var sel = $("coSel");
    if(sel){
      sel.value = IT0001.bukrs;
      sel.onchange = function(){ switchCompany(sel.value); };
    }
    var ls = $("leadSel");
    if(ls){
      renderLeaderOptions();
      ls.onchange = function(){
        state.leader = ls.value;
        var pj = $("mProj"); if(pj) pj.dataset.for = "";
        clearMass();
      };
    }
  })();
  function setPanelOpen(panelId, togId, open){
    var p = $(panelId), t = $(togId);
    if(!p || !t) return;
    p.classList.toggle("collapsed", !open);
    t.textContent = open ? "▾" : "▸";
    t.setAttribute("aria-expanded", open ? "true" : "false");
  }
  function setTeamTab(tab){
    state.teamTab = tab;
    var panels = {hours:"hoursPanel", allow:"teamAllowPanel", bonus:"bonusPanel"};
    Object.keys(panels).forEach(function(k){
      var p = $(panels[k]);
      if(p) p.hidden = (k !== tab);
    });
    var buttons = {hours:"ttHours", allow:"ttAllow", bonus:"ttBonus"};
    Object.keys(buttons).forEach(function(k){
      var b = $(buttons[k]);
      if(b) b.setAttribute("aria-pressed", k === tab ? "true" : "false");
    });
    /* "Already recorded" switches what it shows with the active tab: the
       hours grid has nothing to say about allowances and vice versa. */
    var showAllow = tab === "allow";
    if($("alreadyHoursWrap")) $("alreadyHoursWrap").hidden = showAllow;
    if($("alreadyAllowWrap")) $("alreadyAllowWrap").hidden = !showAllow;
    if($("alreadyTitle")) $("alreadyTitle").textContent = showAllow ? "Allowances recorded this week" : "Already recorded this week";
    if($("alreadyHint")) $("alreadyHint").title = showAllow
      ? "Allowances already saved for this team this week, from each person's own sheet or an earlier mass entry."
      : "From each person's own sheet or an earlier mass entry, plus whatever is staged below but not yet saved. Amber at 8h, red past it.";
  }

  if($("allowAdd")) $("allowAdd").onclick = openAllow;
  if($("alCode")) $("alCode").onchange = syncAllowForm;
  if($("alSave")) $("alSave").onclick = function(){ saveAllow(); };
  if($("alCancel")) $("alCancel").onclick = function(){ $("dlgAllow").close(); };
  if($("mProj")) $("mProj").onchange = renderTeam;
  if($("mApply")) $("mApply").onclick = applyMass;
  if($("mSave")) $("mSave").onclick = function(){ saveMass(); };
  if($("mClear")) $("mClear").onclick = function(){ clearMass(); toast("Staged entries cleared. Nothing had been saved."); };
  if($("bSave")) $("bSave").onclick = saveBonus;
  if($("mAllowCode")) $("mAllowCode").onchange = syncMassAllowForm;
  if($("mAllowApply")) $("mAllowApply").onclick = applyMassAllow;
  if($("mAllowSave")) $("mAllowSave").onclick = function(){ saveMassAllow(); };
  if($("mAllowClear")) $("mAllowClear").onclick = function(){ clearMassAllow(); toast("Staged allowances cleared. Nothing had been saved."); };

  /* ---------- collapsible panels and in-screen tabs ----------
     Pure display state: which mass-entry tab is showing, and a panel's
     collapsed state, none of it part of the timesheet data, so it lives on
     state.* but never touches WEEKS. */
  if($("sugTog")) $("sugTog").onclick = function(){
    state.sugManualOpen = $("sugPanel").classList.contains("collapsed");
    setPanelOpen("sugPanel", "sugTog", state.sugManualOpen);
  };
  if($("alreadyTog")) $("alreadyTog").onclick = function(){
    setPanelOpen("alreadyPanel", "alreadyTog", $("alreadyPanel").classList.contains("collapsed"));
  };

  if($("ttHours")) $("ttHours").onclick = function(){ state.teamTab = "hours"; renderTeam(); };
  if($("ttAllow")) $("ttAllow").onclick = function(){ state.teamTab = "allow"; renderTeam(); };
  if($("ttBonus")) $("ttBonus").onclick = function(){ state.teamTab = "bonus"; renderTeam(); };

  render();
})();
