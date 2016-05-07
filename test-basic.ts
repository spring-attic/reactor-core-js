import * as flux from './flux';

flux.Flux.range(1, 10)
.map(v => v + 1)
.filter(v => (v & 1) == 0)
.consume(t => console.log(t));

var count = [ 1, 1000, 1000000 ];
var sink = [ 0 ];

for (var c of count) {
    var ops = 0;
    
    
    for (var i = 0; i < 10; i++) {
        const now = new Date().getTime();
        var next = now;
        var operations = 0;
        
        for (;;) {
            
            flux.Flux.range(1, c).consume(e => sink[0] = e);
            
            operations++;
            next = new Date().getTime();
            if (next - now >= 1000) {
                break;
            }
        }
    
        const o = (operations * 1000 / (next - now));
        ops += o;
        //console.log("Count: " + c + "; " + o + " ops/s");
    }
    console.log("");
    console.log("Count: " + c + "; " + (ops / 10) + " ops/s");
}