/**
 * Copyright (c) 2016-2018 Pivotal Software Inc, All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *       https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @flow
 */

import {
  Subscription,
  Subscriber,
  Publisher,
  Processor,
} from './reactivestreams-spec';
import { Disposable, Fuseable, Callable, ScalarCallable } from './flow';
import { FluxArraySubscription, FluxRangeSubscription } from './flux-range';
import { FluxMapSubscriber, FluxHideSubscriber } from './flux-map';
import {
  FluxTakeSubscriber,
  TakeLastSubscriber,
  TakeLastOneSubscriber,
  TakeUntilMainSubscriber,
  FluxSkipSubscriber,
  SkipLastSubscriber,
  SkipUntilMainSubscriber,
} from './flux-take';
import { FluxFilterSubscriber } from './flux-filter';
import { FlatMapSubscriber } from './flux-flatmap';
import { CallbackSubscriber } from './subscriber';
import {
  SH,
  EmptySubscription,
  ScalarSubscription,
  DeferrendScalarSubscription,
} from './subscription';
import { SpscLinkedArrayQueue } from './util';
import { TimedScheduler, DefaultScheduler } from './scheduler';
import { TimedSubscription, PeriodicTimedSubscription } from './flux-timed';
import { ConcatMapSubscriber } from './flux-concat';
import { ZipCoordinator } from './flux-zip';
import { CollectSubscriber, ReduceSubscriber } from './flux-collect';
import { CombineLatest, WithLatestFrom } from './flux-combine';
import { DoOnLifecycle } from './flux-lifecycle';
import { OnErrorReturnSubscriber, OnErrorResumeSubscriber } from './flux-error';
import { SwitchMapSubscriber } from './flux-switchmap';
import {
  DebounceTimedSubscriber,
  SampleTimedSubscriber,
  ThrottleFirstTimedSubscriber,
} from './flux-debounce';
import { AmbCoordinator } from './flux-amb';
import { GenerateSubscription } from './flux-generate';
import { UsingSubscriber } from './flux-using';

/** A publisher with operators to work with reactive streams of 0 to N elements optionally followed by an error or completion. */
export class Flux<T> implements Publisher<T> {
  /** The default buffer size. */
  static bufferSize = 128;

  /** Returns the default buffer size. */
  static get BUFFER_SIZE(): number {
    return Flux.bufferSize;
  }

  subscribe(subscriberOrNext?: Subscriber<T> | (t: T) => void,
            onError?: (t: Error) => void,
            onComplete?: () => void): any {
    if (subscriberOrNext == null || typeof subscriberOrNext === 'function') {
      const cs = new CallbackSubscriber(
        subscriberOrNext == null ? (t: T): void => {} : subscriberOrNext,
        onError == null ? (t: Error): void => {} : onError,
        onComplete == null ? (): void => {} : onComplete,
      );
      this._subscribe(cs);
      return cs;
    } else {
      this._subscribe(subscriberOrNext);
    }
  }

  _subscribe(s: Subscriber<T>): void {
    throw new Error('subscribe method not implemented!');
  }

  static from(source: Publisher<T>): Flux<T> {
    if (source instanceof Flux) {
      return source;
    }
    return new FluxSource(source);
  }

  static range(start: number, count: number): Flux<number> {
    if (count === 0) {
      return Flux.empty();
    } else if (count === 1) {
      return Flux.just(start);
    }
    return new FluxRange(start, count);
  }

  static never<T>(): Flux<T> {
    return FluxNever.INSTANCE;
  }

  static empty<T>(): Flux<T> {
    return FluxEmpty.INSTANCE;
  }

  static just<T>(t: T): Flux<T> {
    if (t == null) {
      throw new Error('t is null');
    }
    return new FluxJust(t);
  }

  static fromCallable<T>(callable: () => T): Flux<T> {
    return new FluxFromCallable(callable);
  }

  static defer<T>(supplier: () => Publisher<T>): Flux<T> {
    return new FluxDefer(supplier);
  }

  static fromArray<T>(array: Array<T>): Flux<T> {
    return new FluxArray(array);
  }

  static timer(delay: number, scheduler?: TimedScheduler): Flux<number> {
    return new FluxTimer(
      delay,
      scheduler == null ? DefaultScheduler.INSTANCE : scheduler,
    );
  }

  static interval(initialDelay: number,
                  period: number,
                  scheduler?: TimedScheduler,): Flux<number> {
    return new FluxInterval(
      initialDelay,
      period,
      scheduler == null ? DefaultScheduler.INSTANCE : scheduler,
    );
  }

  static zip<T, R>(sources: Publisher<T>[],
                   zipper: (v: T[]) => R,
                   prefetch?: number,): Flux<R> {
    return new FluxZip(
      sources,
      zipper,
      prefetch == null ? Flux.BUFFER_SIZE : prefetch,
    );
  }

  static zip2<T1, T2, R>(p1: Publisher<T1>,
                         p2: Publisher<T2>,
                         zipper: (t: T1, u: T2) => R,): Flux<R> {
    return Flux.zip(([p1, p2]: Publisher<any>[]), a =>
      zipper((a[0]: T1), (a[1]: T2)),
    );
  }

  static zip3<T1, T2, T3, R>(p1: Publisher<T1>,
                             p2: Publisher<T2>,
                             p3: Publisher<T3>,
                             zipper: (t: T1, u: T2, v: T3) => R,): Flux<R> {
    return Flux.zip(([p1, p2, p3]: Publisher<any>[]), a =>
      zipper((a[0]: T1), (a[1]: T2), (a[2]: T3)),
    );
  }

  static zip4<T1, T2, T3, T4, R>(p1: Publisher<T1>,
                                 p2: Publisher<T2>,
                                 p3: Publisher<T3>,
                                 p4: Publisher<T4>,
                                 zipper: (t1: T1, t2: T2, t3: T3, t4: T4) => R,): Flux<R> {
    return Flux.zip(([p1, p2, p3, p4]: Publisher<any>[]), a =>
      zipper((a[0]: T1), (a[1]: T2), (a[2]: T3), (a[3]: T4)),
    );
  }

  static merge<T>(sources: Publisher<Publisher<T>>,
                  delayError?: boolean,
                  maxConcurrency?: number,
                  prefetch?: number,): Flux<T> {
    return new FluxFlatMap(
      sources,
      v => v,
      delayError == null ? false : delayError,
      maxConcurrency == null ? Infinity : maxConcurrency,
      prefetch == null ? Flux.BUFFER_SIZE : prefetch,
    );
  }

  static mergeArray<T>(sources: Publisher<T>[],
                       delayError?: boolean,
                       maxConcurrency?: number,
                       prefetch?: number,): Flux<T> {
    return new FluxFlatMap(
      Flux.fromArray(sources),
      v => v,
      delayError == null ? false : delayError,
      maxConcurrency == null ? Infinity : maxConcurrency,
      prefetch == null ? Flux.BUFFER_SIZE : prefetch,
    );
  }

  static concat<T>(sources: Publisher<Publisher<T>>,
                   delayError?: boolean,
                   maxConcurrency?: number,
                   prefetch?: number,): Flux<T> {
    return new FluxConcatMap(
      sources,
      v => v,
      delayError == null ? false : delayError,
      prefetch == null ? Flux.BUFFER_SIZE : prefetch,
    );
  }

  static concatArray<T>(sources: Publisher<T>[],
                        delayError?: boolean,
                        maxConcurrency?: number,
                        prefetch?: number,): Flux<T> {
    return new FluxConcatMap(
      Flux.fromArray(sources),
      v => v,
      delayError == null ? false : delayError,
      prefetch == null ? Flux.BUFFER_SIZE : prefetch,
    );
  }

  static combineLatest<R>(sources: Publisher<any>[],
                          combiner: (t: Array<any>) => R,
                          prefetch?: number,): Flux<R> {
    return new FluxCombineLatest(
      sources,
      combiner,
      prefetch == null ? Flux.BUFFER_SIZE : prefetch,
    );
  }

  static combineLatest2<T1, T2, R>(p1: Publisher<T1>,
                                   p2: Publisher<T2>,
                                   combiner: (t1: T1, t2: T2) => R,
                                   prefetch?: number,): Flux<R> {
    return Flux.combineLatest(
      [p1, p2],
      a => combiner((a[0]: T1), (a[1]: T2)),
      prefetch,
    );
  }

  static combineLatest3<T1, T2, T3, R>(p1: Publisher<T1>,
                                       p2: Publisher<T2>,
                                       p3: Publisher<T3>,
                                       combiner: (t1: T1, t2: T2, t3: T3) => R,
                                       prefetch?: number,): Flux<R> {
    return Flux.combineLatest(
      [p1, p2, p3],
      a => combiner((a[0]: T1), (a[1]: T2), (a[2]: T3)),
      prefetch,
    );
  }

  static combineLatest4<T1, T2, T3, T4, R>(p1: Publisher<T1>,
                                           p2: Publisher<T2>,
                                           p3: Publisher<T3>,
                                           p4: Publisher<T4>,
                                           combiner: (t1: T1, t2: T2, t3: T3, t4: T4) => R,
                                           prefetch?: number,): Flux<R> {
    return Flux.combineLatest(
      [p1, p2, p3, p4],
      a => combiner((a[0]: T1), (a[1]: T2), (a[2]: T3), (a[3]: T4)),
      prefetch,
    );
  }

  static switchOnNext<T>(sources: Publisher<Publisher<T>>,
                         prefetch?: number,): Flux<T> {
    return new FluxSwitchMap(
      sources,
      v => v,
      prefetch == null ? Flux.BUFFER_SIZE : prefetch,
    );
  }

  static amb<T>(sources: Array<Publisher<T>>): Flux<T> {
    return new FluxAmb(sources);
  }

  static generate<T, S>(stateFactory: () => S,
                        generator: (state: S, out: Subscriber<T>) => S,
                        stateDisposer?: (state: S) => void,): Flux<T> {
    return new FluxGenerate(
      stateFactory,
      generator,
      stateDisposer == null ? s => {} : stateDisposer,
    );
  }

  static using<T, R>(resourceFactory: () => R,
                     publisherFactory: (resource: R) => Publisher<T>,
                     resourceDisposer?: (resource: R) => void,
                     eager?: boolean,): Flux<T> {
    return new FluxUsing(
      resourceFactory,
      publisherFactory,
      resourceDisposer == null ? s => {} : resourceDisposer,
      eager == null ? true : eager,
    );
  }

  // ------------------------------------

  map<R>(mapper: (t: T) => R): Flux<R> {
    return new FluxMap(this, mapper);
  }

  as<R>(converter: (p: Flux<T>) => R): R {
    return converter(this);
  }

  compose<R>(composer: (p: Flux<T>) => Publisher<R>): Flux<R> {
    return Flux.defer(() => composer(this));
  }

  filter<R>(predicate: (t: T) => boolean): Flux<T> {
    return new FluxFilter(this, predicate);
  }

  lift<R>(lifter: (s: Subscriber<R>) => Subscriber<T>): Flux<R> {
    return new FluxLift(this, lifter);
  }

  take(n: number): Flux<T> {
    return new FluxTake(this, n);
  }

  flatMap<R>(mapper: (t: T) => Publisher<R>,
             delayError?: boolean,
             maxConcurrency?: number,
             prefetch?: number,): Flux<R> {
    return new FluxFlatMap(
      this,
      mapper,
      delayError == null ? false : delayError,
      maxConcurrency == null ? Infinity : maxConcurrency,
      prefetch == null ? Flux.BUFFER_SIZE : prefetch,
    );
  }

  hide(): Flux<T> {
    return new FluxHide(this);
  }

  concatMap<R>(mapper: (t: T) => Publisher<R>,
               delayError?: boolean,
               prefetch?: number,): Flux<R> {
    return new FluxConcatMap(
      this,
      mapper,
      delayError == null ? false : delayError,
      prefetch == null ? 2 : prefetch,
    );
  }

  mergeWith(other: Publisher<T>): Flux<T> {
    return Flux.fromArray([this, other]).flatMap(v => v);
  }

  concatWith(other: Publisher<T>): Flux<T> {
    return Flux.fromArray([this, other]).concatMap(v => v);
  }

  zipWith<U, R>(other: Publisher<U>, zipper: (t: T, u: U) => R): Flux<R> {
    return Flux.zip2(this, other, zipper);
  }

  collect<U>(collectionFactory: () => U,
             collector: (u: U, t: T) => void,): Flux<U> {
    return new FluxCollect(this, collectionFactory, collector);
  }

  toArray(): Flux<Array<T>> {
    return this.collect(
      () => [],
      (a, b) => {
        a.push(b);
      },
    );
  }

  reduce<U>(initialFactory: () => U, reducer: (u: U, t: T) => U): Flux<U> {
    return new FluxReduce(this, initialFactory, reducer);
  }

  withLatestFrom<U, R>(other: Publisher<U>,
                       combiner: (t: T, u: U) => R,): Flux<R> {
    return new FluxWithLatestFrom(this, other, combiner);
  }

  combineWith<U, R>(other: Publisher<U>,
                    combiner: (t: T, u: U) => R,
                    prefetch?: number,): Flux<R> {
    return Flux.combineLatest2(this, other, combiner, prefetch);
  }

  doOnSubscribe(onSubscribe: (s: Subscription) => void): Flux<T> {
    return new FluxDoOnLifecycle(
      this,
      onSubscribe,
      v => {},
      v => {},
      e => {},
      () => {},
      () => {},
      n => {},
      () => {},
    );
  }

  doOnNext(onNext: (t: T) => void): Flux<T> {
    return new FluxDoOnLifecycle(
      this,
      s => {},
      onNext,
      v => {},
      e => {},
      () => {},
      () => {},
      n => {},
      () => {},
    );
  }

  doOnAfterNext(onAfterNext: (t: T) => void): Flux<T> {
    return new FluxDoOnLifecycle(
      this,
      s => {},
      v => {},
      onAfterNext,
      e => {},
      () => {},
      () => {},
      n => {},
      () => {},
    );
  }

  doOnError(onError: (t: Error) => void): Flux<T> {
    return new FluxDoOnLifecycle(
      this,
      s => {},
      v => {},
      v => {},
      onError,
      () => {},
      () => {},
      n => {},
      () => {},
    );
  }

  doOnComplete(onComplete: () => void): Flux<T> {
    return new FluxDoOnLifecycle(
      this,
      s => {},
      v => {},
      v => {},
      e => {},
      onComplete,
      () => {},
      n => {},
      () => {},
    );
  }

  doAfterTerminated(onAfterTerminate: () => void): Flux<T> {
    return new FluxDoOnLifecycle(
      this,
      s => {},
      v => {},
      v => {},
      e => {},
      () => {},
      onAfterTerminate,
      n => {},
      () => {},
    );
  }

  doOnRequest(onRequest: (n: number) => void): Flux<T> {
    return new FluxDoOnLifecycle(
      this,
      s => {},
      v => {},
      v => {},
      e => {},
      () => {},
      () => {},
      onRequest,
      () => {},
    );
  }

  doOnCancel(onCancel: () => void): Flux<T> {
    return new FluxDoOnLifecycle(
      this,
      s => {},
      v => {},
      v => {},
      e => {},
      () => {},
      () => {},
      n => {},
      onCancel,
    );
  }

  onErrorReturn(value: T): Flux<T> {
    return new FluxOnErrorReturn(this, value);
  }

  onErrorResumeNext(errorMapper: (t: Error) => Publisher<T>): Flux<T> {
    return new FluxOnErrorResumeNext(this, errorMapper);
  }

  switchMap<R>(mapper: (t: T) => Publisher<R>, prefetch?: number): Flux<R> {
    return new FluxSwitchMap(
      this,
      mapper,
      prefetch == null ? Flux.BUFFER_SIZE : prefetch,
    );
  }

  debounce(timeout: number, scheduler?: TimedScheduler): Flux<T> {
    return new FluxDebounceTime(
      this,
      timeout,
      scheduler == null ? DefaultScheduler.INSTANCE : scheduler,
    );
  }

  sample(timeout: number, scheduler?: TimedScheduler): Flux<T> {
    return new FluxSampleTime(
      this,
      timeout,
      scheduler == null ? DefaultScheduler.INSTANCE : scheduler,
    );
  }

  throttleFirst(timeout: number, scheduler?: TimedScheduler): Flux<T> {
    return new FluxThrottleFirstTime(
      this,
      timeout,
      scheduler == null ? DefaultScheduler.INSTANCE : scheduler,
    );
  }

  takeLast(n: number): Flux<T> {
    if (n === 1) {
      return new FluxTakeLastOne(this);
    }
    return new FluxTakeLast(this, n);
  }

  skipLast(n: number): Flux<T> {
    return new FluxSkipLast(this, n);
  }

  takeUntil<U>(other: Publisher<U>): Flux<T> {
    return new FluxTakeUntil(this, other);
  }

  skipUntil<U>(other: Publisher<U>): Flux<T> {
    return new FluxSkipUntil(this, other);
  }

  skip(n: number): Flux<T> {
    if (n === 0) {
      return this;
    }
    return new FluxSkip(this, n);
  }
}

// ----------------------------------------------------------------------

/** Dispatches signals to multiple Subscribers or signals an error if they can't keep up individually. */
export class DirectProcessor<T> extends Flux<T> implements Processor<T, T> {
  _done: boolean;
  _error: ?Error;
  _subscribers: Array<DirectSubscription<T>>;

  constructor() {
    super();
    this._done = false;
    this._error = null;
    this._subscribers = [];
  }

  _subscribe(s: Subscriber<T>): void {
    if (this._done) {
      s.onSubscribe(EmptySubscription.INSTANCE);
      const ex = this._error;
      if (ex != null) {
        s.onError(ex);
      } else {
        s.onComplete();
      }
    } else {
      const ds = new DirectSubscription(s, this);
      this._subscribers.push(ds);
      s.onSubscribe(ds);
    }
  }

  remove(ds: DirectSubscription<T>) {
    const a = this._subscribers;
    const idx = a.indexOf(ds);
    if (idx >= 0) {
      a.splice(idx, 1);
    }
  }

  onSubscribe(s: Subscription) {
    if (this._done) {
      s.cancel();
    } else {
      s.request(Infinity);
    }
  }

  onNext(t: T) {
    if (t === null) {
      throw new Error('t is null');
    }
    const a = this._subscribers;
    for (const s of a) {
      s._actual.onNext(t);
    }
  }

  onError(t: Error) {
    if (t === null) {
      throw new Error('t is null');
    }
    this._error = t;
    this._done = true;
    const a = this._subscribers;
    for (const s of a) {
      s._actual.onError(t);
    }
    a.length = 0;
  }

  onComplete() {
    this._done = true;
    const a = this._subscribers;
    for (const s of a) {
      s._actual.onComplete();
    }
    a.length = 0;
  }
}

export class DirectSubscription<T> implements Subscription {
  _actual: Subscriber<T>;
  _parent: DirectProcessor<T>;
  _requested: number;

  constructor(actual: Subscriber<T>, parent: DirectProcessor<T>) {
    this._actual = actual;
    this._parent = parent;
    this._requested = 0;
  }

  request(n: number) {
    if (SH.validRequest(n)) {
      this._requested += n;
    }
  }

  cancel() {
    this._parent.remove(this);
  }
}

export class UnicastProcessor<T> extends Flux<T>
  implements Processor<T, T>, Subscription {
  _once: boolean;
  _actual: ?Subscriber<T>;
  _requested: number;
  _queue: SpscLinkedArrayQueue<T>;
  _wip: number;
  _cancelled: boolean;
  _done: boolean;
  _error: ?Error;

  constructor(capacity?: number) {
    super();
    this._once = false;
    this._requested = 0;
    this._actual = null;
    this._error = null;
    this._done = false;
    this._wip = 0;
    this._cancelled = false;
    this._queue = new SpscLinkedArrayQueue(
      capacity == null ? Flux.BUFFER_SIZE : capacity,
    );
  }

  _subscribe(s: Subscriber<T>) {
    if (!this._once) {
      this._once = true;
      this._actual = s;
      s.onSubscribe(this);
    } else {
      EmptySubscription.error(s, new Error('Only one Subscriber allowed'));
    }
  }

  onSubscribe(s: Subscription) {
    if (this._done) {
      s.cancel();
    } else {
      s.request(Infinity);
    }
  }

  onNext(t: T) {
    if (t === null) {
      throw new Error('t is null');
    }
    this._queue.offer(t);
    this.drain();
  }

  onError(t: Error) {
    if (t === null) {
      throw new Error('t is null');
    }
    this._error = t;
    this._done = true;
    this.drain();
  }

  onComplete() {
    this._done = true;
    this.drain();
  }

  request(n: number) {
    if (SH.validRequest(n)) {
      this._requested += n;
      this.drain();
    }
  }

  cancel() {
    this._cancelled = true;
    if (this._wip++ === 0) {
      this._actual = null;
      this._queue.clear();
    }
  }

  drain() {
    if (this._actual == null) {
      return;
    }
    if (this._wip++ !== 0) {
      return;
    }

    const missed = 1;

    for (;;) {
      const r = this._requested;
      let e = 0;

      while (e !== r) {
        if (this._cancelled) {
          this._actual = null;
          this._queue.clear();
          return;
        }

        const d = this._done;
        const v = this._queue.poll();
        const empty = v == null;

        if (d && empty) {
          if (this._actual != null) {
            const ex = this._error;
            if (ex != null) {
              this._actual.onError(ex);
            } else {
              this._actual.onComplete();
            }
            this._actual = null;
          }
          return;
        }

        if (empty) {
          break;
        }

        if (this._actual != null) {
          this._actual.onNext(v);
        }

        e++;
      }

      if (e == r) {
        if (this._cancelled) {
          this._actual = null;
          this._queue.clear();
          return;
        }
        const d = this._done;
        const empty = this._queue.isEmpty();

        if (d && empty) {
          if (this._actual != null) {
            const ex = this._error;
            if (ex != null) {
              this._actual.onError(ex);
            } else {
              this._actual.onComplete();
            }
            this._actual = null;
          }
          return;
        }
      }

      if (e != 0) {
        this._requested -= e;
      }

      const m = this._wip - missed;
      this._wip = m;
      if (m == 0) {
        break;
      }
    }
  }
}

// ----------------------------------------------------------------------

class FluxSource<T> extends Flux<T> {
  _source: Publisher<T>;

  constructor(source: Publisher<T>) {
    super();
    this._source = source;
  }

  _subscribe(s: Subscriber<T>) {
    this._source.subscribe(s);
  }
}

class FluxRange extends Flux<number> implements Fuseable {
  _start: number;
  _count: number;

  constructor(start: number, count: number) {
    super();
    this._start = start;
    this._count = count;
  }

  _subscribe(s: Subscriber<number>): void {
    s.onSubscribe(
      new FluxRangeSubscription(this._start, this._start + this._count, s),
    );
  }

  isFuseable() {}
}

class FluxMap<T, R> extends Flux<R> {
  _source: Publisher<T>;
  _mapper: (t: T) => R;

  constructor(source: Publisher<T>, mapper: (t: T) => R) {
    super();
    this._source = source;
    this._mapper = mapper;
  }

  _subscribe(s: Subscriber<R>) {
    this._source.subscribe(new FluxMapSubscriber(s, this._mapper));
  }
}

class FluxEmpty<T> extends Flux<T> implements Fuseable, ScalarCallable<T> {
  static INSTANCE: Flux<any> = new FluxEmpty();

  _subscribe(s: Subscriber<any>) {
    EmptySubscription.complete(s);
  }

  isFuseable() {}

  isScalar() {}

  call() {
    return null;
  }
}

class FluxNever<T> extends Flux<T> {
  static INSTANCE: Flux<any> = new FluxNever();

  _subscribe(s: Subscriber<any>) {
    s.onSubscribe(EmptySubscription.INSTANCE);
  }
}

class FluxJust<T> extends Flux<T> implements ScalarCallable<T> {
  _value: T;

  constructor(value: T) {
    super();
    this._value = value;
  }

  isScalar() {}

  _subscribe(s: Subscriber<T>): void {
    s.onSubscribe(new ScalarSubscription(this._value, s));
  }

  call(): T {
    return this._value;
  }
}

class FluxFromCallable<T> extends Flux<T> implements Callable<T> {
  _callable: () => T;

  constructor(callable: () => T) {
    super();
    this._callable = callable;
  }

  _subscribe(s: Subscriber<T>): void {
    const dsd = new DeferrendScalarSubscription(s);
    s.onSubscribe(dsd);

    let v;
    try {
      v = this._callable();
    } catch (ex) {
      s.onError(ex);
      return;
    }
    if (v === null) {
      s.onError(new Error('The callable returned null'));
      return;
    }
    dsd.complete(v);
  }

  call(): T {
    return this._callable();
  }
}

class FluxDefer<T> extends Flux<T> {
  _supplier: () => Publisher<T>;

  constructor(supplier: () => Publisher<T>) {
    super();
    this._supplier = supplier;
  }

  _subscribe(s: Subscriber<T>) {
    let p;

    try {
      p = this._supplier();
    } catch (ex) {
      EmptySubscription.error(s, ex);
      return;
    }

    if (p === null) {
      EmptySubscription.error(s, new Error('The supplier returned null'));
      return;
    }

    p.subscribe(s);
  }
}

class FluxFilter<T> extends Flux<T> {
  _source: Publisher<T>;
  _predicate: (t: T) => boolean;

  constructor(source: Publisher<T>, predicate: (t: T) => boolean) {
    super();
    this._source = source;
    this._predicate = predicate;
  }

  _subscribe(s: Subscriber<T>) {
    this._source.subscribe(new FluxFilterSubscriber(s, this._predicate));
  }
}

class FluxLift<T, R> extends Flux<R> {
  _source: Publisher<T>;
  _lifter: (s: Subscriber<R>) => Subscriber<T>;

  constructor(
    source: Publisher<T>,
    lifter: (s: Subscriber<R>) => Subscriber<T>,
  ) {
    super();
    this._source = source;
    this._lifter = lifter;
  }

  _subscribe(s: Subscriber<R>): void {
    this._source.subscribe(this._lifter(s));
  }
}

class FluxArray<T> extends Flux<T> implements Fuseable {
  _array: Array<T>;

  constructor(array: Array<T>) {
    super();
    this._array = array;
  }

  isFuseable() {}

  _subscribe(s: Subscriber<T>) {
    s.onSubscribe(new FluxArraySubscription(this._array, s));
  }
}

class FluxTake<T> extends Flux<T> {
  _source: Flux<T>;
  _n: number;

  constructor(source: Flux<T>, n: number) {
    super();
    this._source = source;
    this._n = n;
  }

  _subscribe(s: Subscriber<T>) {
    this._source.subscribe(new FluxTakeSubscriber(this._n, s));
  }
}

class FluxSkip<T> extends Flux<T> {
  _source: Flux<T>;
  _n: number;

  constructor(source: Flux<T>, n: number) {
    super();
    this._source = source;
    this._n = n;
  }

  _subscribe(s: Subscriber<T>) {
    this._source.subscribe(new FluxSkipSubscriber(s, this._n));
  }
}

class FluxFlatMap<T, R> extends Flux<R> {
  _source: Publisher<T>;
  _mapper: (t: T) => Publisher<R>;
  _delayError: boolean;
  _maxConcurrency: number;
  _prefetch: number;

  constructor(
    source: Publisher<T>,
    mapper: (t: T) => Publisher<R>,
    delayError: boolean,
    maxConcurrency: number,
    prefetch: number,
  ) {
    super();
    this._source = source;
    this._mapper = mapper;
    this._delayError = delayError;
    this._maxConcurrency = maxConcurrency;
    this._prefetch = prefetch;
  }

  _subscribe(s: Subscriber<R>): void {
    this._source.subscribe(
      new FlatMapSubscriber(
        s,
        this._mapper,
        this._delayError,
        this._maxConcurrency,
        this._prefetch,
      ),
    );
  }
}

class FluxHide<T> extends Flux<T> {
  _source: Flux<T>;

  constructor(source: Flux<T>) {
    super();
    this._source = source;
  }

  _subscribe(s: Subscriber<T>) {
    this._source.subscribe(new FluxHideSubscriber(s));
  }
}

class FluxTimer extends Flux<number> {
  _delay: number;
  _scheduler: TimedScheduler;

  constructor(delay: number, scheduler: TimedScheduler) {
    super();
    this._delay = delay;
    this._scheduler = scheduler;
  }

  _subscribe(s: Subscriber<number>): void {
    const p = new TimedSubscription(s);
    s.onSubscribe(p);

    const c = this._scheduler.scheduleDelayed(() => p.run(), this._delay);

    p.setFuture(c);
  }
}

class FluxInterval extends Flux<number> {
  _initialDelay: number;
  _period: number;
  _scheduler: TimedScheduler;

  constructor(initialDelay: number, period: number, scheduler: TimedScheduler) {
    super();
    this._initialDelay = initialDelay;
    this._period = period;
    this._scheduler = scheduler;
  }

  _subscribe(s: Subscriber<number>): void {
    const p = new PeriodicTimedSubscription(s);
    s.onSubscribe(p);

    const c = this._scheduler.schedulePeriodic(
      () => p.run(),
      this._initialDelay,
      this._period,
    );

    p.setFuture(c);
  }
}

class FluxConcatMap<T, R> extends Flux<R> {
  _source: Publisher<T>;
  _mapper: (t: T) => Publisher<R>;
  _delayError: boolean;
  _prefetch: number;

  constructor(
    source: Publisher<T>,
    mapper: (t: T) => Publisher<R>,
    delayError: boolean,
    prefetch: number,
  ) {
    super();
    this._source = source;
    this._mapper = mapper;
    this._delayError = delayError;
    this._prefetch = prefetch;
  }

  _subscribe(s: Subscriber<R>): void {
    this._source.subscribe(
      new ConcatMapSubscriber(
        s,
        this._mapper,
        this._delayError,
        this._prefetch,
      ),
    );
  }
}

class FluxZip<T, R> extends Flux<R> {
  _sources: Publisher<T>[];
  _zipper: (v: T[]) => R;
  _prefetch: number;

  constructor(
    sources: Publisher<T>[],
    zipper: (v: T[]) => R,
    prefetch: number,
  ) {
    super();
    this._sources = sources;
    this._zipper = zipper;
    this._prefetch = prefetch;
  }

  _subscribe(s: Subscriber<R>): void {
    const n = this._sources.length;
    const coord = new ZipCoordinator(s, this._zipper, this._prefetch, n);
    s.onSubscribe(coord);

    coord.subscribe(this._sources, n);
  }
}

class FluxCollect<T, U> extends Flux<U> {
  _source: Publisher<T>;
  _factory: () => U;
  _collector: (U, T) => void;

  constructor(
    source: Publisher<T>,
    factory: () => U,
    collector: (U, T) => void,
  ) {
    super();
    this._source = source;
    this._factory = factory;
    this._collector = collector;
  }

  _subscribe(s: Subscriber<U>): void {
    let c;

    try {
      c = this._factory();
    } catch (ex) {
      EmptySubscription.error(s, ex);
      return;
    }

    if (c == null) {
      EmptySubscription.error(
        s,
        new Error('The factory returned a null value'),
      );
      return;
    }

    this._source.subscribe(new CollectSubscriber(s, c, this._collector));
  }
}

class FluxReduce<T, U> extends Flux<U> {
  _source: Publisher<T>;
  _initialFactory: () => U;
  _reducer: (u: U, t: T) => U;

  constructor(
    source: Publisher<T>,
    initialFactory: () => U,
    reducer: (u: U, t: T) => U,
  ) {
    super();
    this._source = source;
    this._initialFactory = initialFactory;
    this._reducer = reducer;
  }

  _subscribe(s: Subscriber<U>): void {
    let c;

    try {
      c = this._initialFactory();
    } catch (ex) {
      EmptySubscription.error(s, ex);
      return;
    }

    if (c == null) {
      EmptySubscription.error(
        s,
        new Error('The initialFactory returned a null value'),
      );
      return;
    }

    this._source.subscribe(new ReduceSubscriber(s, c, this._reducer));
  }
}

class FluxWithLatestFrom<T, U, R> extends Flux<R> {
  _source: Publisher<T>;
  _other: Publisher<U>;
  _combiner: (t: T, u: U) => R;

  constructor(
    source: Publisher<T>,
    other: Publisher<U>,
    combiner: (t: T, u: U) => R,
  ) {
    super();
    this._source = source;
    this._other = other;
    this._combiner = combiner;
  }

  _subscribe(s: Subscriber<R>): void {
    const parent = new WithLatestFrom(s, this._combiner);

    parent.subscribe(this._other);

    this._source.subscribe(parent);
  }
}

class FluxCombineLatest<R> extends Flux<R> {
  _sources: Array<Publisher<any>>;
  _combiner: (a: Array<any>) => R;
  _prefetch: number;

  constructor(
    sources: Array<Publisher<any>>,
    combiner: (a: Array<any>) => R,
    prefetch: number,
  ) {
    super();
    this._sources = sources;
    this._combiner = combiner;
    this._prefetch = prefetch;
  }

  _subscribe(s: Subscriber<R>): void {
    const a = this._sources;
    const n = a.length;
    const parent = new CombineLatest(s, this._combiner, this._prefetch, n);
    s.onSubscribe(parent);

    parent.subscribe(a, n);
  }
}

class FluxDoOnLifecycle<T> extends Flux<T> {
  _source: Publisher<T>;
  _onSubscribe: (s: Subscription) => void;
  _onNext: (t: T) => void;
  _onAfterNext: (t: T) => void;
  _onError: (t: Error) => void;
  _onComplete: () => void;
  _onAfterTerminate: () => void;
  _onRequest: (n: number) => void;
  _onCancel: () => void;

  constructor(
    source: Publisher<T>,
    onSubscribe: (s: Subscription) => void,
    onNext: (t: T) => void,
    onAfterNext: (t: T) => void,
    onError: (t: Error) => void,
    onComplete: () => void,
    onAfterTerminate: () => void,
    onRequest: (n: number) => void,
    onCancel: () => void,
  ) {
    super();
    this._source = source;
    this._onSubscribe = onSubscribe;
    this._onNext = onNext;
    this._onAfterNext = onAfterNext;
    this._onError = onError;
    this._onComplete = onComplete;
    this._onAfterTerminate = onAfterTerminate;
    this._onRequest = onRequest;
    this._onCancel = onCancel;
  }

  _subscribe(s: Subscriber<T>): void {
    this._source.subscribe(
      new DoOnLifecycle(
        s,
        this._onSubscribe,
        this._onNext,
        this._onAfterNext,
        this._onError,
        this._onComplete,
        this._onAfterTerminate,
        this._onRequest,
        this._onCancel,
      ),
    );
  }
}

class FluxOnErrorReturn<T> extends Flux<T> {
  _source: Publisher<T>;
  _value: T;

  constructor(source: Publisher<T>, value: T) {
    super();
    this._source = source;
    this._value = value;
  }

  _subscribe(s: Subscriber<T>): void {
    this._source.subscribe(new OnErrorReturnSubscriber(s, this._value));
  }
}

class FluxOnErrorResumeNext<T> extends Flux<T> {
  _source: Publisher<T>;
  _errorMapper: (t: Error) => Publisher<T>;

  constructor(source: Publisher<T>, errorMapper: (t: Error) => Publisher<T>) {
    super();
    this._source = source;
    this._errorMapper = errorMapper;
  }

  _subscribe(s: Subscriber<T>): void {
    this._source.subscribe(new OnErrorResumeSubscriber(s, this._errorMapper));
  }
}

class FluxSwitchMap<T, R> extends Flux<R> {
  _source: Publisher<T>;
  _mapper: (t: T) => Publisher<R>;
  _prefetch: number;

  constructor(
    source: Publisher<T>,
    mapper: (t: T) => Publisher<R>,
    prefetch: number,
  ) {
    super();
    this._source = source;
    this._mapper = mapper;
    this._prefetch = prefetch;
  }

  _subscribe(s: Subscriber<R>): void {
    this._source.subscribe(
      new SwitchMapSubscriber(s, this._mapper, this._prefetch),
    );
  }
}

class FluxDebounceTime<T> extends Flux<T> {
  _source: Publisher<T>;
  _timeout: number;
  _scheduler: TimedScheduler;

  constructor(
    source: Publisher<T>,
    timeout: number,
    scheduler: TimedScheduler,
  ) {
    super();
    this._source = source;
    this._timeout = timeout;
    this._scheduler = scheduler;
  }

  _subscribe(s: Subscriber<T>): void {
    this._source.subscribe(
      new DebounceTimedSubscriber(
        s,
        this._timeout,
        this._scheduler.createWorker(),
      ),
    );
  }
}

class FluxSampleTime<T> extends Flux<T> {
  _source: Publisher<T>;
  _timeout: number;
  _scheduler: TimedScheduler;

  constructor(
    source: Publisher<T>,
    timeout: number,
    scheduler: TimedScheduler,
  ) {
    super();
    this._source = source;
    this._timeout = timeout;
    this._scheduler = scheduler;
  }

  _subscribe(s: Subscriber<T>): void {
    this._source.subscribe(
      new SampleTimedSubscriber(s, this._timeout, this._scheduler),
    );
  }
}

class FluxThrottleFirstTime<T> extends Flux<T> {
  _source: Publisher<T>;
  _timeout: number;
  _scheduler: TimedScheduler;

  constructor(
    source: Publisher<T>,
    timeout: number,
    scheduler: TimedScheduler,
  ) {
    super();
    this._source = source;
    this._timeout = timeout;
    this._scheduler = scheduler;
  }

  _subscribe(s: Subscriber<T>): void {
    this._source.subscribe(
      new ThrottleFirstTimedSubscriber(
        s,
        this._timeout,
        this._scheduler.createWorker(),
      ),
    );
  }
}

class FluxTakeLast<T> extends Flux<T> {
  _source: Publisher<T>;
  _n: number;

  constructor(source: Publisher<T>, n: number) {
    super();
    this._source = source;
    this._n = n;
  }

  _subscribe(s: Subscriber<T>): void {
    this._source.subscribe(new TakeLastSubscriber(s, this._n));
  }
}

class FluxTakeLastOne<T> extends Flux<T> {
  _source: Publisher<T>;

  constructor(source: Publisher<T>) {
    super();
    this._source = source;
  }

  _subscribe(s: Subscriber<T>): void {
    this._source.subscribe(new TakeLastOneSubscriber(s));
  }
}

class FluxSkipLast<T> extends Flux<T> {
  _source: Publisher<T>;
  _n: number;

  constructor(source: Publisher<T>, n: number) {
    super();
    this._source = source;
    this._n = n;
  }

  _subscribe(s: Subscriber<T>): void {
    this._source.subscribe(new SkipLastSubscriber(s, this._n));
  }
}

class FluxTakeUntil<T, U> extends Flux<T> {
  _source: Publisher<T>;
  _other: Publisher<U>;

  constructor(source: Publisher<T>, other: Publisher<U>) {
    super();
    this._source = source;
    this._other = other;
  }

  _subscribe(s: Subscriber<T>): void {
    const main = new TakeUntilMainSubscriber(s);

    this._other.subscribe(main.getOther());

    this._source.subscribe(main);
  }
}

class FluxSkipUntil<T, U> extends Flux<T> {
  _source: Publisher<T>;
  _other: Publisher<U>;

  constructor(source: Publisher<T>, other: Publisher<U>) {
    super();
    this._source = source;
    this._other = other;
  }

  _subscribe(s: Subscriber<T>): void {
    const main = new SkipUntilMainSubscriber(s);

    this._other.subscribe(main.getOther());

    this._source.subscribe(main);
  }
}

class FluxAmb<T> extends Flux<T> {
  _sources: Array<Publisher<T>>;

  constructor(sources: Array<Publisher<T>>) {
    super();
    this._sources = sources;
  }

  _subscribe(s: Subscriber<T>): void {
    const n = this._sources.length;
    const c = new AmbCoordinator(s, n);

    s.onSubscribe(c);

    c.subscribe(this._sources, n);
  }
}

class FluxGenerate<T, S> extends Flux<T> {
  _stateFactory: () => S;
  _generator: (state: S, out: Subscriber<T>) => S;
  _stateDisposer: (state: S) => void;

  constructor(
    stateFactory: () => S,
    generator: (state: S, out: Subscriber<T>) => S,
    stateDisposer: (state: S) => void,
  ) {
    super();
    this._stateFactory = stateFactory;
    this._generator = generator;
    this._stateDisposer = stateDisposer;
  }

  _subscribe(s: Subscriber<T>): void {
    let state;

    try {
      state = this._stateFactory();
    } catch (ex) {
      EmptySubscription.error(s, ex);
      return;
    }

    s.onSubscribe(
      new GenerateSubscription(s, state, this._generator, this._stateDisposer),
    );
  }
}

class FluxUsing<T, R> extends Flux<T> {
  _resourceFactory: () => R;
  _publisherFactory: (resource: R) => Publisher<T>;
  _resourceDisposer: (resource: R) => void;
  _eager: boolean;

  constructor(
    resourceFactory: () => R,
    publisherFactory: (resource: R) => Publisher<T>,
    resourceDisposer: (resource: R) => void,
    eager: boolean,
  ) {
    super();
    this._resourceFactory = resourceFactory;
    this._publisherFactory = publisherFactory;
    this._resourceDisposer = resourceDisposer;
    this._eager = eager;
  }

  _subscribe(s: Subscriber<T>): void {
    UsingSubscriber.subscribe(
      s,
      this._resourceFactory,
      this._publisherFactory,
      this._resourceDisposer,
      this._eager,
    );
  }
}
