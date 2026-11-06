import type {APIRoute} from 'astro';
import {websitePilotMaterials} from '../../../../data/website-pilots.mjs';
export function getStaticPaths(){return websitePilotMaterials.map(material=>({params:{file:material.id},props:{material}}));}
export const GET:APIRoute=({props})=>new Response(props.material.body,{headers:{'Content-Type':'text/markdown; charset=utf-8','Content-Disposition':`attachment; filename="${props.material.id}.md"`}});
