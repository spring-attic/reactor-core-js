import * as rs from "./reactivestreams-spec";
import * as flow from "./flow";
import * as range from "./flux-range";
import * as map from "./flux-map";
import * as filter from "./flux-filter";
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
    
    static fromCallable<T>(callable: () => T) {
        return new FluxFromCallable<T>(callable);
    }
    
    static defer<T>(supplier: () => rs.Publisher<T>) {
        return new FluxDefer<T>(supplier);
    }
    
    // ------------------------------------
    
    map<R>(mapper: (t: T) => R) {
        return new FluxMap<T, R>(this, mapper);
    }
    
    as<R>(converter: (p: Flux<T>) => R) {
        return converter(this);
    }
    
    compose<R>(composer: (p: Flux<T>) => rs.Publisher<R>) {
        return Flux.defer(() => composer(this));
    }

    filter<R>(predicate: (t: T) => boolean) {
        return new FluxFilter<T>(this, predicate);
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
        s.onSubscribe(new range.FluxRangeSubscription(this.mStart, this.mEnd, s));
    }
    
    isFuseable() { }
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
        this.mSource.subscribe(new map.FluxMapSubscriber<T, R>(s, this.mMapper));
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

class FluxFromCallable<T> extends Flux<T> implements flow.Callable<T> {
    private mCallable: () => T;
    
    constructor(callable: () => T) {
        super();
        this.mCallable = callable;
    }
    
    subscribe(s: rs.Subscriber<T>) : void {
        const dsd = new sp.DeferrendScalarSubscription<T>(s);
        s.onSubscribe(dsd);
        
        var v;
        try {
            v = this.mCallable();
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
        return this.mCallable();
    }
}

class FluxDefer<T> extends Flux<T> {
    private mSupplier: () => rs.Publisher<T>;
    
    constructor(supplier: () => rs.Publisher<T>) {
        super();
        this.mSupplier = supplier;
    }
    
    subscribe(s: rs.Subscriber<T>) {
        var p;
        
        try {
            p = this.mSupplier();
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
    
    private mSource : rs.Publisher<T>;
    private mPredicate : (t: T) => boolean;
    
    constructor(source: rs.Publisher<T>, predicate: (t: T) => boolean) {
        super();
        this.mSource = source;
        this.mPredicate = predicate;
    }
    
    subscribe(s: rs.Subscriber<T>) {
        this.mSource.subscribe(new filter.FluxFilterSubscriber<T>(s, this.mPredicate));
    }
}
