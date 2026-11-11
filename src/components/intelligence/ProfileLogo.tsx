import {useState} from 'react';
import registry from '@/data/intelligence/logos.json';
type Logo={id:string;asset?:string|null;status:string;sourcePage?:string;sourceAsset?:string;checkedDate?:string;maxDisplayPx?:number;background?:string};
/** Only reviewed local artwork; unknown identity stays text, never a substituted crest. */
export default function ProfileLogo({id,name}:{id:string;name:string}){
 const [failed,setFailed]=useState(false);
 const logo=(registry.logos as Logo[]).find(l=>l.id===id&&l.status==='verified'&&l.asset);
 return <span className={`sc-logo ${logo?.background==='dark'?'sc-logo-dark':''}`}>{logo&&!failed?<img src={logo.asset!} alt={`${name} logo`} loading="lazy" width="80" height="80" style={logo.maxDisplayPx?{maxWidth:logo.maxDisplayPx,maxHeight:logo.maxDisplayPx}:undefined} onError={()=>setFailed(true)}/>:<span aria-label={`${name}: logo unavailable`}>{name.split(/\s+/).filter(w=>!['of','the'].includes(w.toLowerCase())).slice(0,3).map(w=>w[0]).join('')}</span>}</span>;
}
