import * as rs from './reactivestreams-spec';
import * as sp from './subscription';
import * as flow from './flow';
import * as util from './util';

export class CollectSubscriber<T, U> extends sp.DeferrendScalarSubscription<U>
implements rs.Subscriber<T>, rs.Subscription {
    
    private s: rs.Subscription;
    
    private done: boolean;
    
    constructor(private actual: rs.Subscriber<U>, private collection: U, private collector: (U, T) => void) {
        super(actual);
    }
    
    onSubscribe(s: rs.Subscription) : void {
        if (sp.SH.validSubscription(this.s, s)) {
            this.s = s;
            
            this.actual.onSubscribe(this);
            
            s.request(Infinity);
        }
    }
    
    onNext(t: T) : void {
        if (this.done) {
            return;
        }
        try {
            this.collector(this.collection, t);
        } catch (ex) {
            this.s.cancel();
            this.onError(ex);
            return;
        }
    }
    
    onError(t: Error) : void {
        if (this.done) {
            console.log(t);
            return;
        }
        this.done = true;
        this.actual.onError(t);
    }
    
    onComplete() : void {
        if (this.done) {
            return;
        }
        this.done = true;
        super.complete(this.collection);
    }
    
    request(n: number) : void {
        super.request(n);
    }
    
    cancel() : void {
        super.cancel();
        this.s.cancel();
   }
}

export class ReduceSubscriber<T, U> extends sp.DeferrendScalarSubscription<U>
implements rs.Subscriber<T>, rs.Subscription {
    
    private s: rs.Subscription;
    
    private done: boolean;
    
    constructor(private actual: rs.Subscriber<U>, private accumulator: U, private reducer: (U, T) => U) {
        super(actual);
    }
    
    onSubscribe(s: rs.Subscription) : void {
        if (sp.SH.validSubscription(this.s, s)) {
            this.s = s;
            
            this.actual.onSubscribe(this);
            
            s.request(Infinity);
        }
    }
    
    onNext(t: T) : void {
        if (this.done) {
            return;
        }
        
        var u;
        try {
            u = this.reducer(this.accumulator, t);
        } catch (ex) {
            this.s.cancel();
            this.onError(ex);
            return;
        }
        
        if (u == null) {
            this.s.cancel();
            this.onError(new Error("The reducer returned a null value"));
            return;
        }
        this.accumulator = u;
    }
    
    onError(t: Error) : void {
        if (this.done) {
            console.log(t);
            return;
        }
        this.done = true;
        this.actual.onError(t);
    }
    
    onComplete() : void {
        if (this.done) {
            return;
        }
        this.done = true;
        super.complete(this.accumulator);
    }
    
    request(n: number) : void {
        super.request(n);
    }
    
    cancel() : void {
        super.cancel();
        this.s.cancel();
    }
}