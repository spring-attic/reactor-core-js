import * as rs from "./reactivestreams-spec";
import * as flow from "./flow";
//import * as range from "./flux-range";
//import * as solo from "./flux-solo";
//import * as map from "./flux-map";
import * as subscriber from "./subscriber";
import * as sp from './subscription';

export abstract class Flux<T> implements rs.Publisher<T> {
    
    abstract subscribe(s: rs.Subscriber<T>) : void;
    
    static range(start: number, count: number) : Flux<number> {
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
    
    // ------------------------------------
    
    map<R>(mapper: (t: T) => R) {
        return new FluxMap<T, R>(this, mapper);
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

class FluxRange extends Flux<number> implements flow.Fuseable {
    private mStart: number;
    private mEnd: number;
    
    constructor(public start: number, public count: number) {
        super();
        this.mStart = start;
        this.mEnd = start + count;
    }
    
    subscribe(s: rs.Subscriber<number>) : void {
        s.onSubscribe(new FluxRangeSubscription(this.mStart, this.mEnd, s));
    }
    
    isFuseable() { }
}

class FluxRangeSubscription implements flow.QueueSubscription<number> {
    private mActual : rs.Subscriber<number>;
    private mEnd : number;
    private requested : number;
    private mIndex : number;
    private cancelled : boolean;
    
    constructor(start: number, end: number, actual: rs.Subscriber<number>) {
        this.mActual = actual;
        this.mIndex = start;
        this.mEnd = end;
        this.requested = 0;
        this.cancelled = false;
    }
    
    request(n : number) : void {
        if (n <= 0) {
            throw new Error("n > 0 required but it was " + n);
        }
        var r = this.requested;
        this.requested = r + n;
        
        if (r == 0) {
            r = n;
            var e = 0;
            var i = this.mIndex;
            const f = this.mEnd;
            const a = this.mActual;
            
            for (;;) {
                if (this.cancelled) {
                    return;
                }

                while (e != r && i != f) {
                    a.onNext(i);

                    if (this.cancelled) {
                        return;
                    }

                    i++;
                    e++;                    
                }

                if (this.cancelled) {
                    return;
                }
                
                if (i == f) {
                    a.onComplete();
                    return;
                }
                
                n = this.requested;
                if (r == n) {
                    this.requested = 0;
                    return;
                } else {
                    r = n;
                }
                
            }
        }
    }
    
    cancel() : void {
        this.cancelled = true;
    }
    
    requestFusion(mode: number) : number {
        if ((mode & flow.FC.SYNC) != 0) {
            return flow.FC.SYNC;
        }
        return flow.FC.NONE;
    }
    
    offer(t: number) : boolean {
        throw flow.FC.unsupported();
    }
    
    poll() : number {
        const index = this.mIndex;
        if (index == this.mEnd) {
            return null;
        }
        this.mIndex = index + 1;
        return index;
    }
    
    isEmpty() : boolean {
        return this.mIndex == this.mEnd;
    }
    
    size() : number {
        return this.mEnd - this.mIndex;
    }
    
    clear() {
        this.mIndex = this.mEnd;
    }
}

class FluxMap<T, R> extends Flux<R> {
    
    private mSource : rs.Publisher<T>;
    private mMapper : (t: T) => R;
    
    constructor(source: rs.Publisher<T>, mapper: (t: T) => R) {
        super();
        this.mSource = source;
        this.mMapper = mapper;
    }
    
    subscribe(s: rs.Subscriber<R>) {
        this.mSource.subscribe(new FluxMapSubscriber<T, R>(s, this.mMapper));
    }
}

class FluxMapSubscriber<T, R> implements rs.Subscriber<T>, rs.Subscription {
    private mActual : rs.Subscriber<R>;
    private mMapper : (t: T) => R;

    private s : rs.Subscription;
    private done : boolean;
    
    constructor(actual : rs.Subscriber<R>, mapper : (t: T) => R) {
        this.mActual = actual;
        this.mMapper = mapper;
    }
    
    onSubscribe(s: rs.Subscription) {
        if (sp.SH.validSubscription(this.s, s)) {
            this.s = s;
            
            this.mActual.onSubscribe(this);
        }
    }
    
    onNext(t: T) {
        if (this.done) {
            return;
        }
        
        var v;
        try {
            v = this.mMapper(t);
        } catch (ex) {
            this.s.cancel();
            this.onError(ex);
            return;
        }
        
        this.mActual.onNext(v);
    }
    
    onError(t: Error) {
        if (this.done) {
            console.log(t);
            return;
        }
        this.done = true;
        this.mActual.onError(t);
    }
    
    onComplete() {
        if (this.done) {
            return;
        }        
        this.done = true;
        this.mActual.onComplete();
    }
    
    request(n : number) {
        this.s.request(n);
    }
    
    cancel() {
        this.s.cancel();
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
    private mValue : T;
    
    constructor(value: T) {
        super();
        this.mValue = value;
    }
    
    isScalar() { }
    
    subscribe(s: rs.Subscriber<T>) : void {
        s.onSubscribe(new sp.ScalarSubscription<T>(this.mValue, s));
    }
    
    call() : T {
        return this.mValue;
    }
}