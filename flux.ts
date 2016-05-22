import * as rs from "./reactivestreams-spec";
import * as flow from "./flow";
import * as range from "./flux-range";
import * as map from "./flux-map";
import * as take from "./flux-take";
import * as filter from "./flux-filter";
import * as flatmap from "./flux-flatmap";
import * as subscriber from "./subscriber";
import * as sp from './subscription';
import * as util from './util';
import * as sch from './scheduler';
import * as timed from './flux-timed';
import * as concat from './flux-concat';
import * as zip from './flux-zip';
import * as collect from './flux-collect';
import * as combine from './flux-combine';
import * as lcy from './flux-lifecycle';

/** A publisher with operators to work with reactive streams of 0 to N elements optionally followed by an error or completion. */
export abstract class Flux<T> implements rs.Publisher<T> {
    
    /** The default buffer size. */
    private static bufferSize = 128;
    
    /** Returns the default buffer size. */
    public static get BUFFER_SIZE() { return Flux.bufferSize; };
    
    abstract subscribe(s: rs.Subscriber<T>) : void;
    
    static range(start: number, count: number) : Flux<number> {
        if (count == 0) {
            return Flux.empty();
        } else
        if (count == 1) {
            return Flux.just(start);
        }
        return new FluxRange(start, count);
    }
    
    static never<T>() : Flux<T> {
        return FluxNever.INSTANCE;
    }

    static empty<T>() : Flux<T> {
        return FluxEmpty.INSTANCE;
    }
    
    static just<T>(t: T) : Flux<T> {
        if (t == null) {
            throw new Error("t is null");
        }
        return new FluxJust<T>(t);
    }
    
    static fromCallable<T>(callable: () => T) : Flux<T> {
        return new FluxFromCallable<T>(callable);
    }
    
    static defer<T>(supplier: () => rs.Publisher<T>) : Flux<T> {
        return new FluxDefer<T>(supplier);
    }
    
    static fromArray<T>(array: Array<T>) : Flux<T> {
        return new FluxArray<T>(array);
    }
    
    static timer(delay: number, scheduler?: sch.TimedScheduler) : Flux<number> {
        return new FluxTimer(delay, scheduler === undefined ? sch.DefaultScheduler.INSTANCE : scheduler);
    }

    static interval(initialDelay: number, period: number, scheduler?: sch.TimedScheduler) : Flux<number> {
        return new FluxInterval(initialDelay, period, scheduler === undefined ? sch.DefaultScheduler.INSTANCE : scheduler);
    }
    
    static zip<T, R>(sources: rs.Publisher<T>[], zipper: (v: T[]) => R, prefetch?: number) : Flux<R> {
        return new FluxZip<T, R>(sources, zipper, prefetch === undefined ? Flux.BUFFER_SIZE : prefetch);
    }
    
    static zip2<T1, T2, R>(p1: rs.Publisher<T1>, p2: rs.Publisher<T2>, zipper: (t: T1, u: T2) => R) : Flux<R> {
        return Flux.zip<Object, R>([p1, p2], a => zipper(a[0] as T1, a[1] as T2));
    }
    
    static zip3<T1, T2, T3, R>(p1: rs.Publisher<T1>, p2: rs.Publisher<T2>, p3: rs.Publisher<T3>, 
            zipper: (t: T1, u: T2, v: T3) => R) : Flux<R> {
        return Flux.zip<Object, R>([p1, p2, p3], a => zipper(a[0] as T1, a[1] as T2, a[2] as T3));
    }

    static zip4<T1, T2, T3, T4, R>(p1: rs.Publisher<T1>, p2: rs.Publisher<T2>, p3: rs.Publisher<T3>,
            p4: rs.Publisher<T4>, 
            zipper: (t1: T1, t2: T2, t3: T3, t4: T4) => R) : Flux<R> {
        return Flux.zip<Object, R>([p1, p2, p3, p4], a => zipper(a[0] as T1, a[1] as T2, a[2] as T3, a[3] as T4));
    }
    
    static merge<T>(sources: rs.Publisher<rs.Publisher<T>>, delayError?: boolean, maxConcurrency?: number, prefetch?: number) : Flux<T> {
        return new FluxFlatMap(sources, v => v, delayError === undefined ? false : delayError, 
            maxConcurrency === undefined ? Infinity : maxConcurrency, prefetch === undefined ? Flux.BUFFER_SIZE : prefetch);
    }

    static mergeArray<T>(sources: rs.Publisher<T>[], delayError?: boolean, maxConcurrency?: number, prefetch?: number) : Flux<T> {
        return new FluxFlatMap(Flux.fromArray(sources), v => v, delayError === undefined ? false : delayError, 
            maxConcurrency === undefined ? Infinity : maxConcurrency, prefetch === undefined ? Flux.BUFFER_SIZE : prefetch);
    }

    static concat<T>(sources: rs.Publisher<rs.Publisher<T>>, delayError?: boolean, maxConcurrency?: number, prefetch?: number) : Flux<T> {
        return new FluxConcatMap(sources, v => v, delayError === undefined ? false : delayError, prefetch === undefined ? Flux.BUFFER_SIZE : prefetch);
    }

    static concatArray<T>(sources: rs.Publisher<T>[], delayError?: boolean, maxConcurrency?: number, prefetch?: number) : Flux<T> {
        return new FluxConcatMap(Flux.fromArray(sources), v => v, delayError === undefined ? false : delayError, prefetch === undefined ? Flux.BUFFER_SIZE : prefetch);
    }
    
    static combineLatest<R>(sources: rs.Publisher<Object>[], combiner: (t: Array<Object>) => R, prefetch?: number) : Flux<R> {
        return new FluxCombineLatest<R>(sources, combiner, prefetch === undefined ? Flux.BUFFER_SIZE : prefetch);
    }
    
    static combineLatest2<T1, T2, R>(p1: rs.Publisher<T1>, p2: rs.Publisher<T2>, combiner: (t1: T1, t2: T2) => R, prefetch?: number) : Flux<R> {
        return Flux.combineLatest([p1, p2], a => combiner(a[0] as T1, a[1] as T2), prefetch);        
    }

    static combineLatest3<T1, T2, T3, R>(p1: rs.Publisher<T1>, p2: rs.Publisher<T2>, p3: rs.Publisher<T3>, combiner: (t1: T1, t2: T2, t3: T3) => R, prefetch?: number) : Flux<R> {
        return Flux.combineLatest([p1, p2, p3], a => combiner(a[0] as T1, a[1] as T2, a[2] as T3), prefetch);        
    }

    static combineLatest4<T1, T2, T3, T4, R>(p1: rs.Publisher<T1>, p2: rs.Publisher<T2>, p3: rs.Publisher<T3>, p4: rs.Publisher<T4>, combiner: (t1: T1, t2: T2, t3: T3, t4: T4) => R, prefetch?: number) : Flux<R> {
        return Flux.combineLatest([p1, p2, p3, p4], a => combiner(a[0] as T1, a[1] as T2, a[2] as T3, a[3] as T4), prefetch);        
    }
    
    // ------------------------------------
    
    map<R>(mapper: (t: T) => R) : Flux<R> {
        return new FluxMap<T, R>(this, mapper);
    }
    
    as<R>(converter: (p: Flux<T>) => R) : R {
        return converter(this);
    }
    
    compose<R>(composer: (p: Flux<T>) => rs.Publisher<R>) : Flux<R> {
        return Flux.defer(() => composer(this));
    }

    filter<R>(predicate: (t: T) => boolean) : Flux<T> {
        return new FluxFilter<T>(this, predicate);
    }
    
    lift<R>(lifter: (s: rs.Subscriber<R>) => rs.Subscriber<T>) : Flux<R> {
        return new FluxLift(this, lifter);
    }
    
    take(n: number) : Flux<T> {
        return new FluxTake<T>(this, n);
    }

    flatMap<R>(mapper: (t: T) => rs.Publisher<R>, delayError?: boolean, maxConcurrency?: number, prefetch?: number) : Flux<R> {
        return new FluxFlatMap<T, R>(this, mapper, 
            delayError === undefined ? false : delayError,
            maxConcurrency === undefined ? Infinity : maxConcurrency,
            prefetch === undefined ? Flux.BUFFER_SIZE : prefetch
        );
    }

    hide() : Flux<T> {
        return new FluxHide<T>(this);
    }
    
    concatMap<R>(mapper: (t: T) => rs.Publisher<R>, delayError?: boolean, prefetch?: number) : Flux<R> {
        return new FluxConcatMap<T, R>(this, mapper, 
            delayError === undefined ? false : delayError,
            prefetch === undefined ? 2 : prefetch)
    }
    
    mergeWith(other: rs.Publisher<T>) : Flux<T> {
        return Flux.fromArray([this, other]).flatMap(v => v);
    }
    
    concatWith(other: rs.Publisher<T>) : Flux<T> {
        return Flux.fromArray([this, other]).concatMap(v => v);
    }
    
    zipWith<U, R>(other: rs.Publisher<U>, zipper: (t: T, u: U) => R) : Flux<R> {
        return Flux.zip2(this, other, zipper);
    }
    
    collect<U>(collectionFactory: () => U, collector: (u: U, t: T) => void) : Flux<U> {
        return new FluxCollect<T, U>(this, collectionFactory, collector);
    }
    
    toArray() : Flux<Array<T>> {
        return this.collect<Array<T>>(() => new Array<T>(), (a, b) => a.push(b));
    }
    
    reduce<U>(initialFactory: () => U, reducer: (u: U, t: T) => U) : Flux<U> {
        return new FluxReduce<T, U>(this, initialFactory, reducer);
    }
    
    withLatestFrom<U, R>(other: rs.Publisher<U>, combiner: (t: T, u: U) => R) : Flux<R> {
        return new FluxWithLatestFrom(this, other, combiner);
    }
    
    combineWith<U, R>(other: rs.Publisher<U>, combiner: (t: T, u: U) => R, prefetch?: number) {
        return Flux.combineLatest2(this, other, combiner, prefetch);
    }
    
    doOnSubscribe(onSubscribe: (s: rs.Subscription) => void) : Flux<T> {
        return new FluxDoOnLifecycle<T>(this,
            onSubscribe,
            v => { },
            v => { },
            e => { },
            () => { },
            () => { },
            n => { },
            () => { } 
        );

    }
    
    doOnNext(onNext: (t: T) => void) : Flux<T> {
        return new FluxDoOnLifecycle<T>(this,
            s => { },
            onNext,
            v => { },
            e => { },
            () => { },
            () => { },
            n => { },
            () => { } 
        );
    }
    
    doOnAfterNext(onAfterNext: (t: T) => void) : Flux<T> {
        return new FluxDoOnLifecycle<T>(this,
            s => { },
            v => { },
            onAfterNext,
            e => { },
            () => { },
            () => { },
            n => { },
            () => { } 
        );

    }

    doOnError(onError: (t: Error) => void) : Flux<T> {
        return new FluxDoOnLifecycle<T>(this,
            s => { },
            v => { },
            v => { },
            onError,
            () => { },
            () => { },
            n => { },
            () => { } 
        );
    }

    doOnComplete(onComplete: () => void) : Flux<T> {
        return new FluxDoOnLifecycle<T>(this,
            s => { },
            v => { },
            v => { },
            e => { },
            onComplete,
            () => { },
            n => { },
            () => { } 
        );
    }
    
    doAfterTerminated(onAfterTerminate: () => void) : Flux<T> {
        return new FluxDoOnLifecycle<T>(this,
            s => { },
            v => { },
            v => { },
            e => { },
            () => { },
            onAfterTerminate,
            n => { },
            () => { } 
        );
    }
    
    doOnCancel(onCancel: () => void) : Flux<T> {
        return new FluxDoOnLifecycle<T>(this,
            s => { },
            v => { },
            v => { },
            e => { },
            () => { },
            () => { },
            n => { },
            onCancel 
        );

    }
    
    // ------------------------------------
    
    consume(onNext : (t: T) => void, onError? : (t : Error) => void, onComplete? : () => void) : flow.Cancellation {
        const cs = new subscriber.CallbackSubscriber(
            onNext, 
            onError === undefined ? (t: Error) : void => { console.log(t); } : onError,
            onComplete === undefined ? () : void => { } : onComplete);
        this.subscribe(cs);
        return cs;
    }

}

// ----------------------------------------------------------------------

/** Dispatches signals to multiple Subscribers or signals an error if they can't keep up individually. */
export class DirectProcessor<T> extends Flux<T> implements rs.Processor<T, T> {
    private mDone: boolean;
    private mError: Error;
    private subscribers: Array<DirectSubscription<T>>;
    
    constructor() {
        super();
        this.mDone = false;
        this.mError = null;
        this.subscribers = new Array<DirectSubscription<T>>();
    }
    
    subscribe(s: rs.Subscriber<T>) : void {
        if (this.mDone) {
            s.onSubscribe(sp.EmptySubscription.INSTANCE);
            const ex = this.mError;
            if (ex !== undefined) {
                s.onError(ex);
            } else {
                s.onComplete();
            }
        } else {
            const ds = new DirectSubscription<T>(s, this);
            this.subscribers.push(ds);
            s.onSubscribe(ds);
        }
    }
    
    remove(ds: DirectSubscription<T>) {
        const a = this.subscribers;
        const idx = a.indexOf(ds);
        if (idx >= 0) {
            a.splice(idx, 1);
        }
    }
    
    onSubscribe(s: rs.Subscription) {
        if (this.mDone) {
            s.cancel();
        } else {
            s.request(Infinity);
        }
    }
    
    onNext(t: T) {
        if (t === null) {
            throw new Error("t is null");
        }
        const a = this.subscribers;
        for (var s of a) {
            s.actual.onNext(t);
        }
    }
    
    onError(t: Error) {
        if (t === null) {
            throw new Error("t is null");
        }
        this.mError = t;
        this.mDone = true;
        const a = this.subscribers;
        for (var s of a) {
            s.actual.onError(t);
        }
        a.length = 0;
    }
    
    onComplete() {
        this.mDone = true;
        const a = this.subscribers;
        for (var s of a) {
            s.actual.onComplete();
        }
        a.length = 0;
    }
}

export class DirectSubscription<T> implements rs.Subscription {
    
    mRequested: number;
    
    constructor(public actual: rs.Subscriber<T>, public parent: DirectProcessor<T>) {
        this.mRequested = 0;
    }
    
    request(n: number) {
        if (sp.SH.validRequest(n)) {
            this.mRequested += n;
        }
    }
    
    cancel() {
        this.parent.remove(this);
    }
}

export class UnicastProcessor<T> extends Flux<T> implements rs.Processor<T, T>, rs.Subscription {
    
    private once: boolean;
    
    private mActual: rs.Subscriber<T>;
    
    private mRequested : number;
    
    private queue: util.SpscLinkedArrayQueue<T>;
    
    private wip: number;
    
    private cancelled: boolean;
    private done: boolean;
    private error: Error;
    
    constructor(capacity? : number) {
        super();
        this.once = false;
        this.mRequested = 0;
        this.mActual = null;
        this.error = null;
        this.done = false;
        this.wip = 0;
        this.cancelled = false;
        this.queue = new util.SpscLinkedArrayQueue<T>(capacity === undefined ? Flux.BUFFER_SIZE : capacity);
    }
    
    subscribe(s: rs.Subscriber<T>) {
        if (!this.once) {
            this.once = true;
            this.mActual = s;
            s.onSubscribe(this);
        } else {
            sp.EmptySubscription.error(s, new Error("Only one Subscriber allowed"));
        }
    }
    
    onSubscribe(s: rs.Subscription) {
        if (this.done) {
            s.cancel();
        } else {
            s.request(Infinity);
        }
    }
    
    onNext(t: T) {
        if (t === null) {
            throw new Error("t is null");
        }
        this.queue.offer(t);
        this.drain();
    }
    
    onError(t: Error) {
        if (t === null) {
            throw new Error("t is null");
        }
        this.error = t;
        this.done = true;
        this.drain();
    }
    
    onComplete() {
        this.done = true;
        this.drain();
    }
    
    request(n: number) {
        if (sp.SH.validRequest(n)) {
            this.mRequested += n;
            this.drain();
        }
    }
    
    cancel() {
        this.cancelled = true;
        if (this.wip++ == 0) {
            this.mActual = null;
            this.queue.clear();
        }
        
    }
    
    drain() {
        if (this.mActual == null) {
            return;
        }
        if (this.wip++ != 0) {
            return;
        }
        
        var missed = 1;
        
        for (;;) {
            
            const r = this.mRequested;
            var e = 0;
            
            while (e != r) {
                if (this.cancelled) {
                    this.mActual = null;
                    this.queue.clear();
                    return;
                }
                
                const d = this.done;
                const v = this.queue.poll();
                const empty = v == null;
                
                if (d && empty) {
                    const ex = this.error;
                    if (ex != null) {
                        this.mActual.onError(ex);
                    } else {
                        this.mActual.onComplete();
                    }
                    this.mActual = null;
                    return;
                }
                
                if (empty) {
                    break;
                }
                
                this.mActual.onNext(v);
                
                e++;
            }
            
            if (e == r) {
                if (this.cancelled) {
                    this.mActual = null;
                    this.queue.clear();
                    return;
                }
                const d = this.done;
                const empty = this.queue.isEmpty();
                
                if (d && empty) {
                    const ex = this.error;
                    if (ex != null) {
                        this.mActual.onError(ex);
                    } else {
                        this.mActual.onComplete();
                    }
                    this.mActual = null;
                    return;
                }
            }
            
            if (e != 0) {
                this.mRequested -= e;
            }
            
            const m = this.wip - missed;
            this.wip = m;
            if (m == 0) {
                break;
            }
        }
    }
}

// ----------------------------------------------------------------------

class FluxRange extends Flux<number> implements flow.Fuseable {

    constructor(private start: number, private count: number) {
        super();
    }
    
    subscribe(s: rs.Subscriber<number>) : void {
        s.onSubscribe(new range.FluxRangeSubscription(this.start, this.start + this.count, s));
    }
    
    isFuseable() { }
}



class FluxMap<T, R> extends Flux<R> {
    
    constructor(private source: rs.Publisher<T>, private mapper: (t: T) => R) {
        super();
    }
    
    subscribe(s: rs.Subscriber<R>) {
        this.source.subscribe(new map.FluxMapSubscriber<T, R>(s, this.mapper));
    }
}


class FluxEmpty<T> extends Flux<T> 
implements flow.Fuseable, flow.ScalarCallable<T> {
    
    static INSTANCE : Flux<any> = new FluxEmpty<any>();
    
    subscribe(s: rs.Subscriber<any>) {
        sp.EmptySubscription.complete(s);
    }
    
    isFuseable() { }
    
    isScalar() { }
    
    call() : T {
        return null;
    }
}

class FluxNever<T> extends Flux<T> {
    
    static INSTANCE : Flux<any> = new FluxNever<any>();
    
    subscribe(s: rs.Subscriber<any>) {
        s.onSubscribe(sp.EmptySubscription.INSTANCE);
    }
}

class FluxJust<T> extends Flux<T> implements flow.ScalarCallable<T> {
    
    constructor(private value: T) {
        super();
    }
    
    isScalar() { }
    
    subscribe(s: rs.Subscriber<T>) : void {
        s.onSubscribe(new sp.ScalarSubscription<T>(this.value, s));
    }
    
    call() : T {
        return this.value;
    }
}

class FluxFromCallable<T> extends Flux<T> implements flow.Callable<T> {
    
    constructor(private callable: () => T) {
        super();
    }
    
    subscribe(s: rs.Subscriber<T>) : void {
        const dsd = new sp.DeferrendScalarSubscription<T>(s);
        s.onSubscribe(dsd);
        
        var v;
        try {
            v = this.callable();
        } catch (ex) {
            s.onError(ex);
            return;
        }
        if (v === null) {
            s.onError(new Error("The callable returned null"));
            return;
        }
        dsd.complete(v);
    }
    
    call() : T {
        return this.callable();
    }
}

class FluxDefer<T> extends Flux<T> {
    constructor(private supplier: () => rs.Publisher<T>) {
        super();
    }
    
    subscribe(s: rs.Subscriber<T>) {
        var p;
        
        try {
            p = this.supplier();
        } catch (ex) {
            sp.EmptySubscription.error(s, ex);
            return;
        }
        
        if (p === null) {
            sp.EmptySubscription.error(s, new Error("The supplier returned null"));
            return;
        }
        
        p.subscribe(s);
    }
}

class FluxFilter<T> extends Flux<T> {
    
    constructor(private source: rs.Publisher<T>, private predicate: (t: T) => boolean) {
        super();
    }
    
    subscribe(s: rs.Subscriber<T>) {
        this.source.subscribe(new filter.FluxFilterSubscriber<T>(s, this.predicate));
    }
}

class FluxLift<T, R> extends Flux<R> {
    
    constructor(private source: rs.Publisher<T>, private lifter: (s: rs.Subscriber<R>) => rs.Subscriber<T>) {
        super();
    }
    
    subscribe(s: rs.Subscriber<R>) : void {
        this.source.subscribe(this.lifter(s));
    }
}

class FluxArray<T> extends Flux<T> implements flow.Fuseable {
    
    constructor(private array: Array<T>) {
        super();
    }
    
    isFuseable() { }
    
    subscribe(s: rs.Subscriber<T>) {
        s.onSubscribe(new range.FluxArraySubscription<T>(this.array, s));
    }
}

class FluxTake<T> extends Flux<T> {
    
    constructor(private source: Flux<T>, private n: number) {
        super();
    }
    
    subscribe(s: rs.Subscriber<T>) {
        this.source.subscribe(new take.FluxTakeSubscriber<T>(this.n, s));
    }
}

class FluxSkip<T> extends Flux<T> {
    
    constructor(private source: Flux<T>, private n: number) {
        super();
    }
    
    subscribe(s: rs.Subscriber<T>) {
        this.source.subscribe(new take.FluxSkipSubscriber<T>(s, this.n));
    }
}

class FluxFlatMap<T, R> extends Flux<R> {
    
    constructor(
            private source: rs.Publisher<T>, 
            private mapper: (t: T) => rs.Publisher<R>,
            private delayError: boolean, 
            private maxConcurrency: number, 
            private prefetch: number) {
        super();
    }
    
    subscribe(s: rs.Subscriber<R>) : void {
        /*
        const c = (this.mSource as Object) as flow.Callable<T>;
        if (c.call) {
            var v;
            try {            
                v = c.call();
            } catch (ex) {
                sp.EmptySubscription.error(s, ex);
                return;
            }
            
            if (v == null) {
                sp.EmptySubscription.complete(s);
                return;
            }
            
            var p;
            
            try {            
                p = this.mMapper(v);
            } catch (ex) {
                sp.EmptySubscription.error(s, ex);
                return;
            }        

            if (p == null) {
                sp.EmptySubscription.error(s, new Error("The mapper returned a null Publisher"));
                return;
            }
            
            p.subscribe(s);
            return;
        }
        */
        this.source.subscribe(new flatmap.FlatMapSubscriber<T, R>(
            s, this.mapper, this.delayError,
            this.maxConcurrency, this.prefetch
        ));    
    }
}

class FluxHide<T> extends Flux<T> {
    constructor(private mSource: Flux<T>) { 
        super();
    }
    
    subscribe(s: rs.Subscriber<T>) {
        this.mSource.subscribe(new map.FluxHideSubscriber<T>(s));
    }
}

class FluxTimer extends Flux<number> {
    constructor(private delay : number, private scheduler : sch.TimedScheduler) {
        super();
    }
    
    subscribe(s: rs.Subscriber<number>) : void {
        var p = new timed.TimedSubscription(s);
        s.onSubscribe(p);
        
        var c = this.scheduler.scheduleDelayed(p.run, this.delay);
        
        p.setFuture(c);
    }
}

class FluxInterval extends Flux<number> {
    constructor(private initialDelay : number, private period: number, private scheduler : sch.TimedScheduler) {
        super();
    }
    
    subscribe(s: rs.Subscriber<number>) : void {
        var p = new timed.PeriodicTimedSubscription(s);
        s.onSubscribe(p);
        
        var c = this.scheduler.schedulePeriodic(p.run, this.initialDelay, this.period);
        
        p.setFuture(c);
    }
}

class FluxConcatMap<T, R> extends Flux<R> {
    constructor(private source: rs.Publisher<T>, 
            private mapper: (t: T) => rs.Publisher<R>, 
            private delayError: boolean, private prefetch: number) {
        super();        
    }
    
    subscribe(s: rs.Subscriber<R>) : void {
        this.source.subscribe(new concat.ConcatMapSubscriber<T, R>(s, this.mapper, this.delayError, this.prefetch));
    }
}

class FluxZip<T, R> extends Flux<R> {
    constructor(private sources: rs.Publisher<T>[], private zipper: (v: T[]) => R, private prefetch: number) {
        super();
    }
    
    subscribe(s: rs.Subscriber<R>) : void {
        const n = this.sources.length;
        const coord = new zip.ZipCoordinator<T, R>(s, this.zipper, this.prefetch, n);
        s.onSubscribe(coord);
        
        coord.subscribe(this.sources, n);
    }    
}

class FluxCollect<T, U> extends Flux<U> {
    constructor(private source: rs.Publisher<T>, private factory: () => U, private collector: (U, T) => void) {
        super();
    }
    subscribe(s: rs.Subscriber<U>) : void {
        var c;
        
        try {
            c = this.factory();
        } catch (ex) {
            sp.EmptySubscription.error(s, ex);
            return;
        }
        
        if (c == null) {
            sp.EmptySubscription.error(s, new Error("The factory returned a null value"));
            return;
        }
        
        this.source.subscribe(new collect.CollectSubscriber<T, U>(s, c, this.collector));
    }
}

class FluxReduce<T, U> extends Flux<U> {
    constructor(private source: rs.Publisher<T>, private initialFactory: () => U, private reducer: (u: U, t: T) => U) {
        super();
    }
    
    subscribe(s: rs.Subscriber<U>) : void {
        var c;
        
        try {
            c = this.initialFactory();
        } catch (ex) {
            sp.EmptySubscription.error(s, ex);
            return;
        }
        
        if (c == null) {
            sp.EmptySubscription.error(s, new Error("The initialFactory returned a null value"));
            return;
        }
        
        this.source.subscribe(new collect.ReduceSubscriber<T, U>(s, c, this.reducer));
    }
}

class FluxWithLatestFrom<T, U, R> extends Flux<R> {
    constructor(private source: rs.Publisher<T>, private other: rs.Publisher<U>, private combiner: (t: T, u: U) => R) {
        super();
    }
    
    subscribe(s: rs.Subscriber<R>) : void {
        var parent = new combine.WithLatestFrom<T, U, R>(s, this.combiner);
        
        parent.subscribe(this.other);
        
        this.source.subscribe(parent);
    }
}

class FluxCombineLatest<R> extends Flux<R> {
    constructor(private sources: Array<rs.Publisher<Object>>, private combiner: (a: Array<Object>) => R, private prefetch : number) {
        super();
    }

    subscribe(s: rs.Subscriber<R>) : void {
        var a = this.sources;
        var n = a.length;
        var parent = new combine.CombineLatest<R>(s, this.combiner, this.prefetch, n);
        s.onSubscribe(parent);
        
        parent.subscribe(a, n);
    }    
    
}

class FluxDoOnLifecycle<T> extends Flux<T> {
    constructor(private source: rs.Publisher<T>,
            private onSubscribe: (s: rs.Subscription) => void,
            private onNext: (t: T) => void,
            private mOnAfterNext: (t: T) => void,
            private onError: (t: Error) => void,
            private onComplete: () => void,
            private onAfterTerminate: () => void,
            private onRequest: (n: number) => void,
            private onCancel: () => void
    ) {
        super();
    }
    
    subscribe(s: rs.Subscriber<T>) : void {
        this.source.subscribe(new lcy.DoOnLifecycle(s,
                this.onSubscribe,
                this.onNext,
                this.mOnAfterNext,
                this.onError,
                this.onComplete,
                this.onAfterTerminate,
                this.onRequest,
                this.onCancel
        ));       
    }
}