import {createContext, useContext} from 'react';
export const RecruitingData = createContext<{demo:boolean; request:typeof fetch}>({demo:false,request:(...args)=>fetch(...args)});
export const useRecruitingData = () => useContext(RecruitingData);
const program = {id:'sample-program',institution:'Mountain College (Synthetic)',shortName:'Sample College',gender:'womens',division:'DII',conference:'Demo conference',city:'Denver',state:'CO',regions:['colorado'],programUrl:null,staffUrl:null};
const coach = {coachId:'sample-coach',name:'Jordan Sample',role:'Head Coach — synthetic',email:'coach@example.invalid',emailIsPersonal:false,phone:null,staffPageUrl:null,checkedDate:null};
const camp = {id:'sample-camp',institution:program.institution,campName:'Sample College ID Day',region:'colorado',city:'Denver',state:'CO',gender:'womens',ageEligibility:'U16–U19',startDate:null,endDate:null,registrationOpens:null,registrationDeadline:null,price:null,registrationUrl:null,listingStatus:'directory_only',estimateEvidence:null,sourceUrl:null,checkedDate:null,program};
const showcase = {id:'sample-showcase',name:'Synthetic Regional Showcase',organizer:'Demo organizer',region:'colorado',city:'Denver',state:'CO',officialUrl:null,gender:'womens',ageGroups:'U16–U19',startDate:null,endDate:null,registrationDeadline:null,entryType:'Team',listingStatus:'directory_only',recruitingEvidence:null,historicalAttendance:null,sourceUrl:null,checkedDate:null};
export function createDemoRecruitingRequest(playerId:string):typeof fetch {
 return async (input, init) => {
  const url=new URL(String(input),'https://demo.invalid');
  if(!url.pathname.startsWith('/api/parent/recruiting/')) return Response.json({error:'Unsupported demo operation'},{status:503});
  const key=`sc_demo_recruiting_${playerId}`;
  try {
   const state=JSON.parse(localStorage.getItem(key)||'{"saved":[],"drafts":[]}');
   const method=init?.method||'GET'; const body=JSON.parse(String(init?.body||'{}')); const parts=url.pathname.split('/'); const resource=parts[4]; const id=parts[5];
   if(resource==='programs') return Response.json({programs:[{...program,coaches:[coach]}].filter(p=>(!url.searchParams.get('gender')||p.gender===url.searchParams.get('gender'))&&(!url.searchParams.get('division')||p.division===url.searchParams.get('division'))&&p.institution.toLowerCase().includes((url.searchParams.get('q')||'').toLowerCase()))});
   if(resource==='camps')return Response.json({camps:[camp]});
   if(resource==='showcases')return Response.json({showcases:[showcase]});
   if(!['saved','drafts'].includes(resource))return Response.json({error:'Unsupported operation'},{status:400});
   if(method==='GET')return Response.json({[resource]:state[resource]});
   let rowId=id;
   if(method==='DELETE') state[resource]=state[resource].filter((r:{id:string})=>r.id!==id);
   else if(resource==='saved') {
    const existing=state.saved.find((r:{itemId:string})=>r.itemId===body.itemId);
    rowId=existing?.id||crypto.randomUUID();
    state.saved=state.saved.filter((r:{id:string})=>r.id!==rowId);
    state.saved.push({...body,id:rowId,playerId,createdAt:new Date().toISOString(),program,coach:body.itemType==='coach'?coach:null,camp:body.itemType==='camp'?camp:null,showcase:body.itemType==='showcase'?showcase:null});
   } else {
    rowId=id||crypto.randomUUID();const existing=state.drafts.find((r:{id:string})=>r.id===rowId);
    state.drafts=state.drafts.filter((r:{id:string})=>r.id!==rowId);
    state.drafts.push({status:'draft',createdAt:new Date().toISOString(),...existing,...body,id:rowId,playerId,updatedAt:new Date().toISOString(),coach,program});
   }
   localStorage.setItem(key,JSON.stringify(state));return Response.json({draftId:rowId,success:true});
  }catch{return Response.json({error:'Could not save synthetic recruiting data. Browser storage may be unavailable.'},{status:503});}
 };
}
