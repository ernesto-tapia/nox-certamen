export function hashSeed(seed:string){let h=2166136261;for(let i=0;i<seed.length;i++){h^=seed.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0||1;}
export function nextRandom(state:number):[number,number]{let x=state>>>0;x^=x<<13;x^=x>>>17;x^=x<<5;return[(x>>>0)/4294967296,x>>>0];}
export function rollDie(state:number):[number,number]{const[n,s]=nextRandom(state);return[Math.floor(n*6)+1,s];}
