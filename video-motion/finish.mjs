import {bundle} from '@remotion/bundler';
import {renderStill} from '@remotion/renderer';
import {resolve} from 'node:path';
import {writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
process.chdir(import.meta.dirname);
const serveUrl=await bundle({entryPoint:resolve('index.jsx'),publicDir:resolve('public')});
const common={serveUrl,composition:{id:'StrikeMotion',width:1920,height:1080,fps:30,durationInFrames:2265,props:{},defaultProps:{}},browserExecutable:'C:/Users/HP/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe'};
for(const [name,frame] of [['impulse',590],['why',1900],['benefits',2240]])await renderStill({...common,frame,output:resolve(`out/${name}.png`)});
const ff=(args)=>execFileSync('ffmpeg',['-y','-loglevel','error',...args],{stdio:'inherit'});
const scenes=[['opening',224],['friction',222],['impulse',188],['blank',1153],['why',190],['benefits',288]];
for(const [name,frames] of scenes){
 if(name==='friction'){ff(['-i','out/friction-fixed.mp4','-an','-c:v','libx264','-preset','ultrafast','-crf','18','-pix_fmt','yuv420p','-r','30',`out/seg-${name}.mp4`]);continue;}
 if(name==='blank'){ff(['-f','lavfi','-i','color=c=0x0b0b0b:s=1920x1080:r=30','-frames:v',String(frames),'-c:v','libx264','-preset','ultrafast','-crf','18',`out/seg-${name}.mp4`]);continue;}
 const end=frames/30-.3;
 ff(['-loop','1','-i',`out/${name}.png`,'-vf',`zoompan=z='min(zoom+0.00009,1.025)':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=1920x1080:fps=30,fade=t=in:d=0.3,fade=t=out:st=${end}:d=0.3,format=yuv420p`,'-frames:v',String(frames),'-c:v','libx264','-preset','ultrafast','-crf','18','-threads','4',`out/seg-${name}.mp4`]);
 console.log('Encoded '+name);
}
await writeFile('out/concat.txt',scenes.map(([name])=>`file 'seg-${name}.mp4'`).join('\n'));
ff(['-f','concat','-safe','0','-i','out/concat.txt','-c','copy','out/motion-silent.mp4']);
const audio='C:/Users/HP/Downloads/ElevenLabs_2026-10-23T11_36_21_Lauren - Friendly, Comforting and Soft_pvc_sp100_s50_sb75_v4.mp3';
ff(['-i','out/motion-silent.mp4','-i',audio,'-c:v','copy','-c:a','aac','-b:a','192k','-shortest','-movflags','+faststart','out/strike-everywhere-demo.mp4']);
for(const [name,start,end] of [['intro',0,634/30],['outro',1787/30,75.46775]])ff(['-ss',String(start),'-i','out/strike-everywhere-demo.mp4','-t',String(end-start),'-c:v','libx264','-preset','ultrafast','-crf','18','-c:a','aac','-movflags','+faststart',`out/${name}.mp4`]);
await writeFile('out/EDIT-NOTES.txt','1920x1080, 30fps. Supplied English voice-over retained.\nINTRO 00:00.00 to 00:21.133\nREPLACE VISUAL WITH SCREEN RECORDING 00:21.133 to 00:59.567 (plain near-black, keep audio)\nOUTRO 00:59.567 to 01:15.47\nFull video: strike-everywhere-demo.mp4\nSeparate intro.mp4 and outro.mp4 include their voice-over. motion-silent.mp4 is visuals only.\nRemotion source: ../index.jsx; render.mjs renders all original frame animations. Fast export uses Remotion rendered scenes with FFmpeg camera movement/fades and the fully animated tab scene.\n');
console.log('DONE');
