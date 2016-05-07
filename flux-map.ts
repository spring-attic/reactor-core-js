import * as rs from './reactivestreams-spec';
import * as sp from './subscription';

export class FluxMapSubscriber<T, R> implements rs.Subscriber<T>, rs.Subscription {
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

export class FluxHideSubscriber<T> implements rs.Subscriber<T>, rs.Subscription {
    private s: rs.Subscription;
    
    constructor(private mActual: rs.Subscriber<T>) {
        
    }
    
    onSubscribe(s: rs.Subscription) {
        if (sp.SH.validSubscription(this.s, s)) {
            this.s = s;
            
            this.mActual.onSubscribe(this);
        }
    }

    onNext(t: T) {
        this.mActual.onNext(t);
    }
    
    onError(t: Error) {
        this.mActual.onError(t);
    }
    
    onComplete() {
        this.mActual.onComplete();
    }
    
    request(n: number) {
        this.s.request(n);
    }
    
    cancel() {
        this.s.cancel();
    }
}