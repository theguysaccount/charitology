import type { APIRoute } from 'astro';
import { teachingMaterials } from '../../../data/education-kit.mjs';
export function getStaticPaths() { return teachingMaterials.map(material=>({params:{file:material.id},props:{material}})); }
export const GET: APIRoute = ({props}) => new Response(props.material.body,{headers:{'Content-Type':'text/markdown; charset=utf-8','Content-Disposition':`attachment; filename="${props.material.id}.md"`}});
