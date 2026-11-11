import { useState } from 'react';
import { PpButton } from './PpPrimitives';

/** Local wall-time input is explicitly labeled with the device timezone, as in the existing game form. */
export default function AppearanceForm({ playerId, onSaved, onClose }: {playerId:string; onSaved:()=>void; onClose:()=>void}) {
 const [type,setType]=useState('camp'), [title,setTitle]=useState(''), [date,setDate]=useState(''), [location,setLocation]=useState('');
 const [saving,setSaving]=useState(false), [error,setError]=useState('');
 const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone;
 async function save(e:React.FormEvent){e.preventDefault();setError('');
  const start=new Date(date);
  if(!title.trim()||!date||Number.isNaN(start.valueOf())){setError('Enter an event name and valid date/time.');return;}
  setSaving(true);
  try { const res=await fetch('/api/parent/manual-events',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:title.trim(),eventType:type,startAt:start.toISOString(),location:location.trim(),playerId,allDay:false})});
   if(!res.ok)throw new Error('Event could not be saved. Your entries are still here; please retry.');
   onSaved();
  }catch(e){setError(e instanceof Error?e.message:'Unable to save. Please retry.');}finally{setSaving(false);}
 }
 const input={background:'hsl(var(--pp-white))',color:'hsl(var(--pp-text))',border:'1px solid hsl(var(--pp-border))',borderRadius:8,padding:10,width:'100%',minHeight:44};
 return <form onSubmit={save} className="space-y-4">
 <p className="text-sm" style={{color:'hsl(var(--pp-text-muted))'}}>Add an appearance to this player’s calendar. It stays private until you select it in Coach Sharing and create a link.</p>
 <label className="block text-sm">Event type<select style={input} value={type} onChange={e=>setType(e.target.value)}><option value="camp">Camp</option><option value="tournament">Tournament</option><option value="showcase">Showcase</option></select></label>
 <label className="block text-sm">Event name<input style={input} required maxLength={512} value={title} onChange={e=>setTitle(e.target.value)}/></label>
 <label className="block text-sm">Start date and time<input style={input} required type="datetime-local" value={date} onChange={e=>setDate(e.target.value)}/><span className="text-xs">Entered in {timezone}. Calendar display uses America/Denver.</span></label>
 <label className="block text-sm">Location<input style={input} maxLength={512} value={location} onChange={e=>setLocation(e.target.value)}/></label>
 {error&&<p role="alert" className="text-sm">{error}</p>}
 <div className="flex gap-2"><PpButton type="submit" disabled={saving}>{saving?'Saving…':'Save event'}</PpButton><PpButton type="button" variant="outline" disabled={saving} onClick={()=>{if(!(title||date||location)||window.confirm('Discard this unsaved event?'))onClose();}}>Cancel</PpButton></div>
 </form>;
}
