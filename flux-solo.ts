import * as flow from './flow';
import * as flux from './flux';
import * as sp from './subscription';
import * as rs from './reactivestreams-spec';

export class FluxEmpty<T> extends flux.Flux<T> 
implements flow.Fuseable, flow.ScalarCallable<T> {
    
    static INSTANCE : flux.Flux<any> = new FluxEmpty<any>();
    
    subscribe(s: rs.Subscriber<any>) {
        sp.EmptySubscription.complete(s);
    }
    
    isFuseable() { }
    
    isScalar() { }
    
    call() : T {
        return null;
    }
}

export class FluxNever<T> extends flux.Flux<T> {
    
    static INSTANCE : flux.Flux<any> = new FluxNever<any>();
    
    subscribe(s: rs.Subscriber<any>) {
        s.onSubscribe(sp.EmptySubscription.INSTANCE);
    }
}

export class FluxJust<T> extends flux.Flux<T> implements flow.ScalarCallable<T> {
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