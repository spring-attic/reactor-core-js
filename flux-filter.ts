import * as rs from './reactivestreams-spec';
import * as sp from './subscription';
import * as flow from './flow';

export class FluxFilterSubscriber<T> implements flow.ConditionalSubscriber<T>, rs.Subscription {
    private mActual : rs.Subscriber<T>;
    private mPredicate : (t: T) => boolean;

    private s : rs.Subscription;
    private done : boolean;
    
    constructor(actual : rs.Subscriber<T>, predicate: (t: T) => boolean) {
        this.mActual = actual;
        this.mPredicate = predicate;
    }
    
    onSubscribe(s: rs.Subscription) {
        if (sp.SH.validSubscription(this.s, s)) {
            this.s = s;
            
            this.mActual.onSubscribe(this);
        }
    }
    
    onNext(t: T) {
        if (!this.tryOnNext(t)) {
            this.s.request(1);
        }
    }
    
    tryOnNext(t: T) : boolean {
        if (this.done) {
            return true;
        }
        
        var v;
        try {
            v = this.mPredicate(t);
        } catch (ex) {
            this.s.cancel();
            this.onError(ex);
            return true;
        }
        
        if (v) {
            this.mActual.onNext(t);
            return true;
        }
        return false;
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
