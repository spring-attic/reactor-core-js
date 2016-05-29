[![Join the chat at https://gitter.im/reactor/reactor](https://badges.gitter.im/Join%20Chat.svg)](https://gitter.im/reactor/reactor?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge) [![NPM version](https://img.shields.io/npm/v/reactor-core-js.svg)](https://www.npmjs.com/package/reactor-core-js)

# reactor-core-js

The Reactive-Streams based implementation of Reactor-Core in TypeScript.

# Importing

```
npm install reactor-core-js
```

[NPM](https://www.npmjs.com/package/reactor-core-js/)

# Usage

```javascript
import { Flux } from './node_modules/reactor-core-js/flux';

Flux.range(1, 10)
.take(5)
.map(v => v * 2)
.flatMap(v => Flux.range(v, 2))
.consume(v => console.log(v));
```

## Reactive Entry points

### Flux

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
