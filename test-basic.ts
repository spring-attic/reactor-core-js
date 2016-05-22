import * as flux from './flux';
import * as ox from './observable-ex';

class Benchmark {
    run() : void {
        console.log("Benchmarking...");

        var count = [ 1, 10, 100, 1000, 10000, 100000, 1000000 ];
        var sink = [ 0 ];


        for (var c of count) {
            var ops = 0;

            const source0 = flux.Flux.range(1, c);
            const source1 = flux.Flux.range(1, c).flatMap(v => flux.Flux.just(v));
            const source2 = flux.Flux.range(1, c).flatMap(v => flux.Flux.range(v, 2));
            const source3 = flux.Flux.range(1, c).flatMap(v => flux.Flux.range(v, 2).hide());

            const d = 1000000 / c;
            const source4 = flux.Flux.range(1, c).flatMap(v => flux.Flux.range(v, d));
            const source5 = flux.Flux.range(1, c).flatMap(v => flux.Flux.range(v, d).hide());
            const source6 = flux.Flux.just(1);
            
            const array = [null];
            
            const source7 = ox.Ox.range(1, c);
            
            const source8 = flux.Flux.range(1, c).concatMap(v => flux.Flux.range(v, d));
            
            for (var i = 0; i < 10; i++) {
                const now = new Date().getTime();
                var next = now;
                var operations = 0;
                
                for (;;) {
                    
                    source8.consume(e => sink[0] = e);
                    
                    //array.push(1);
                    //array.splice(1, 1);
                    //array[0] = 1;
                    //array[0] = 0;
                    
                    operations++;
                    next = new Date().getTime();
                    if (next - now >= 1000) {
                        break;
                    }
                }
            
                const o = (operations * 1000 / (next - now));
                if (i >= 5) {
                    ops += o;
                }
                //console.log("Count: " + c + "; " + o + " ops/s");
            }
            console.log("");
            console.log("Count: " + c + "; " + (ops / 5) + " ops/s");
        }

        console.log("");
        console.log("Benchmark complete.");
        
    }
}

class Tests {
    run() : void {
/*
console.log("Testing...");

flux.Flux.range(1, 10).concatMap(v => flux.Flux.range(v, 2))
.consume(v => console.log(v));

flux.Flux.range(1, 10)
.map(v => v + 1)
.filter(v => (v & 1) == 0)
.consume(t => console.log(t));

flux.Flux.range(1, 10)
.flatMap(v => flux.Flux.range(v, 2).hide())
.consume(t => console.log(t), e => console.log(e), () => console.log("Done"));

flux.Flux.range(1, 10)
.flatMap(v => flux.Flux.range(v, 2))
.consume(t => console.log(t), e => console.log(e), () => console.log("Done"));
*/

        var sp1 = new flux.DirectProcessor<number>();
        var sp2 = new flux.DirectProcessor<String>();
        
        flux.Flux.combineLatest2(sp1, sp2, (a, b) => "" + a + b)
        .consume(v => console.log(v), e => console.log(e), () => console.log("Done"));
        
        sp1.onNext(1);
        sp1.onNext(2);
        sp2.onNext("-2");
        sp2.onNext("-3");
        sp2.onComplete();
        sp1.onNext(3);
        sp1.onComplete();
    }
}

new Tests().run();

