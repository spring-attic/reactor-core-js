import * as flux from './flux';

flux.Flux.range(1, 10).consume(t => console.log(t));