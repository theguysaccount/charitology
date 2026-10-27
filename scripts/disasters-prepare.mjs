import { createDisasterCaptureService, readOrdinaryFile } from '../src/lib/disaster-incidents/capture-io.mjs';
import { canonicalFile, validateCaptureRequest } from '../src/lib/disaster-incidents/capture.mjs';
import { LIMITS } from '../src/lib/disaster-incidents/limits.mjs';
const args=process.argv.slice(2),controller=new AbortController();
process.once('SIGINT',()=>controller.abort(new Error('Canceled by maintainer')));
try {
  const service=createDisasterCaptureService();let result;
  if(args.length===2&&args[0]==='--candidate') {
    if(!/^[a-z][a-z0-9-]{0,63}$/.test(args[1]))throw new Error('Invalid candidate ID');
    const raw=await readOrdinaryFile(service.locations.candidates,args[1]+'/request.json',LIMITS.request);
    result=await service.prepareCapture(validateCaptureRequest(canonicalFile(raw.bytes,LIMITS.request)),controller.signal);
  } else if(args.length===4&&args[0]==='--fetch-descriptor'&&args[2]==='--candidate') {
    result=await service.fetchDescriptorOriginal({descriptor:args[1],candidateId:args[3]},controller.signal);
  } else throw new Error('Usage: disasters-prepare --candidate ID | --fetch-descriptor FIXED_ID --candidate ID');
  console.log(JSON.stringify(result,null,2));
} catch(e){console.error(e.message);process.exitCode=1;}
