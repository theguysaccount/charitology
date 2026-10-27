import { createDisasterCaptureService } from '../src/lib/disaster-incidents/capture-io.mjs';
const args=process.argv.slice(2),controller=new AbortController();
process.once('SIGINT',()=>controller.abort(new Error('Canceled by maintainer')));
try {
  if(args.length!==2||!['--reviewed-hash','--retry','--cancel'].includes(args[0])||!/^[a-f0-9]{64}$/.test(args[1]))throw new Error('Usage: disasters-capture --reviewed-hash HASH | --retry HASH | --cancel HASH');
  const service=createDisasterCaptureService(),result=args[0]==='--cancel'?await service.cancelCapture(args[1]):await service[args[0]==='--retry'?'retryCapture':'installCapture'](args[1],controller.signal);
  console.log(JSON.stringify(result,null,2));if(result.outcome==='recovery-required')process.exitCode=2;
}catch(e){console.error(e.message);process.exitCode=1;}
