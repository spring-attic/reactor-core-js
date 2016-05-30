# Reactor-Core-JS

The Reactive-Streams based implementation of Reactor-Core in TypeScript

# Usage

```javascript
import { Flux } from './node_modules/reactor-core-js/flux';

Flux.range(1, 10)
.take(5)
.map(v => v * 2)
.flatMap(v => Flux.range(v, 2))
.consume(v => console.log(v));
```

# Operator support

Import `flux` package.

## Reactive Entry points

### Flux
  
  - `amb`
  - `combineLatest`, `combineLatest2`, `combineLatest3`, `combineLatest4`
  - `concat`
  - `concatArray`
  - `defer`
  - `empty`
  - `fromArray`
  - `fromCallable`
  - `interval`
  - `just`
  - `merge`
  - `mergeArray`
  - `never`
  - `range`
  - `switchOnNext`
  - `timer`
  - `using`
  - `zip`, `zip2`, `zip3`, `zip4`

### Mono

  - TBD

## Reactive stay

### Flux

  - `as`
  - `collect`
  - `combineWith`
  - `compose`
  - `concatWith`
  - `debounce`
  - `doOnAfterNext`
  - `doOnAfterTerminated`
  - `doOnCancel`
  - `doOnComplete`
  - `doOnError`
  - `doOnNext`
  - `doOnSubscribe`
  - `filter`
  - `flatMap`
  - `generate`
  - `hide`
  - `lift`
  - `map`
  - `onErrorReturn`
  - `onErrorResumeNext`
  - `reduce`
  - `sample`
  - `skip`
  - `skipLast`
  - `skipUntil`
  - `switchMap`
  - `take`
  - `takeLast`
  - `takeUntil`
  - `throttleFirst`
  - `toArray`
  - `withLatestFrom`
  - `zipWith`

### Mono

  - TBD

## Reactive Leave

### Flux

  - `consume`
  - `subscribe`

### Mono

  - `consume`
  - `subscribe`


## Scheduler

Import `scheduler` package.

  - `DefaultScheduler.INSTANCE`