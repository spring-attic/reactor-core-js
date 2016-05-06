import * as flux from './flux';

flux.Flux.range(1, 10)
.map(v => v + 1)
.filter(v => (v & 1) == 0)
.consume(t => console.log(t));