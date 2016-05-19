import * as rs from './reactivestreams-spec';
import * as sp from './subscription';
import * as flow from './flow';
import * as util from './util';

export class WithLatestFrom<T, U, R> implements rs.Subscriber<T>, rs.Subscription {
    
    private s: rs.Subscription;
    
    private otherValue: U;
    
    private otherSubscriber: WithLatestFromOtherSubscriber<T, U, R>;
    
    private error: Error;
    private done: boolean;
    
    constructor(private actual: rs.Subscriber<R>, private combiner: (t: T, u: U) => R) {
        this.s = null;
        this.otherValue = null;
        this.otherSubscriber = new WithLatestFromOtherSubscriber(this);
    }
    
    subscribe(other: rs.Publisher<U>) : void {
        other.subscribe(this.otherSubscriber);
    }
    
    onSubscribe(s: rs.Subscription) : void {
        if (sp.SH.validSubscription(this.s, s)) {
            this.s = s;
            
            this.actual.onSubscribe(this);
        }
    }
    
    onNext(t: T) : void {
        if (this.done) {
            return;
        }
        
        const v = this.otherValue;
        
        if (v == null) {
            this.s.request(1);
            return;
        }
        
        var result;
        
        try {
            result = this.combiner(t, v);
        } catch (ex) {
            this.cancel();
            this.onError(ex);
            return;
        }
        
        if (result == null) {
            this.cancel();
            this.onError(new Error("The combiner returned a null value"));
            return;
        }
        
        this.onNext(result);
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
        this.actual.onComplete();        
    }
    
    request(n: number) : void {
        if (sp.SH.validRequest(n)) {
            this.s.request(n);
        }       
    }
    
    cancelMain() : void {
        const a = this.s;
        if (a != sp.SH.CANCELLED) {
            this.s = sp.SH.CANCELLED;
            if (a != null) {
                a.cancel();
            }
        }
    }
    
    cancel() : void {
        this.cancelMain();
        this.otherSubscriber.cancel();
    }
    
    otherNext(t: U) : void {
        this.otherValue = t;
    }
    
    otherError(t: Error) : void {
        const a = this.s;
        this.cancelMain();
        if (a == null) {
            this.actual.onSubscribe(sp.EmptySubscription.INSTANCE);
        }
        this.onError(t);
    }
    
    otherComplete() : void {
        if (this.otherValue == null) {
            const a = this.s;
            this.cancelMain();
            if (a == null) {
                this.actual.onSubscribe(sp.EmptySubscription.INSTANCE);
            }
            this.actual.onComplete();    
        }
    }
}

class WithLatestFromOtherSubscriber<T, U, R> implements rs.Subscriber<U> {
     
    private s: rs.Subscription;
    
    constructor(private parent: WithLatestFrom<T, U, R>) {
        
    }
     
    onSubscribe(s: rs.Subscription) : void {
        if (sp.SH.validSubscription(this.s, s)) {
            this.s = s;
            s.request(Infinity);
        }
    }
     
    onNext(t: U) : void {
        this.parent.otherNext(t);
    }
     
    onError(t: Error) : void {
        this.parent.otherError(t);
    }
     
    onComplete() : void {
        this.parent.otherComplete();
    }
     
    cancel() : void {
        const a = this.s;
        if (a != sp.SH.CANCELLED) {
            this.s = sp.SH.CANCELLED;
            if (a != null) {
                a.cancel();
            }
        }
    }
}