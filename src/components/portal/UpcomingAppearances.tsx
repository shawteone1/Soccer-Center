import { useCallback, useEffect, useState } from 'react';
import { PpCard, PpButton, PpSectionHeading } from './PpPrimitives';
import { calendarDate, calendarTime } from '@/lib/portal/calendar-display';
interface Event {id:string;title:string;startAt:string;allDay:boolean;eventType:string;location?:string|null;source:string;feedId?:string}
export default function UpcomingAppearances({playerId,onManage}:{playerId:string;onManage:()=>void}) {
 const [events,setEvents]=useState<Event[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(false);
 const load=useCallback(async(signal:AbortSignal)=>{setLoading(true);setError(false);setEvents([]);try{
 const r=await fetch(`/api/parent/players/${encodeURIComponent(playerId)}/schedule`,{credentials:'include',signal});if(!r.ok)throw new Error();
 const data=await r.json() as {events:Event[]};if(signal.aborted)return;
 const today=calendarDate(new Date().toISOString());
 setEvents((data.events??[]).filter(e=>['game','camp','tournament','showcase'].includes(e.eventType)&&(e.allDay?calendarDate(e.startAt,true)>=today:new Date(e.startAt).valueOf()>=Date.now())).sort((a,b)=>a.startAt.localeCompare(b.startAt)).slice(0,6));
 }catch{if(!signal.aborted)setError(true);}finally{if(!signal.aborted)setLoading(false);}},[playerId]);
 const [retry,setRetry]=useState(0);
 useEffect(()=>{const c=new AbortController();void load(c.signal);return()=>c.abort();},[load,retry]);
 return <PpCard><div className="flex flex-wrap justify-between items-center gap-3"><PpSectionHeading>Upcoming events</PpSectionHeading><PpButton size="sm" onClick={onManage}>Manage schedule</PpButton></div>
 <p className="text-xs my-3" style={{color:'hsl(var(--pp-text-muted))'}}>Games, camps, tournaments and showcases. Coach visibility is controlled separately in Coach Sharing.</p>
 {loading?<p role="status">Loading events…</p>:error?<p role="alert">Could not load events. <button type="button" onClick={()=>setRetry(n=>n+1)} className="underline">Retry</button></p>:!events.length?<p>No upcoming events. Add one from your schedule.</p>:<ul className="space-y-3">{events.map(e=><li key={`${e.source}:${e.feedId??''}:${e.id}`} className="rounded-lg border p-3" style={{borderColor:'hsl(var(--pp-border))'}}><strong className="text-sm">{e.title}</strong><p className="text-xs mt-1">{calendarDate(e.startAt,e.allDay)} · {calendarTime(e.startAt,e.allDay)} · {e.eventType}</p>{e.location&&<p className="text-xs mt-1">{e.location}</p>}</li>)}</ul>}
 </PpCard>;
}
