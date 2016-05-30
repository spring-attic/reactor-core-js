import * as rs from './reactivestreams-spec'
import * as sp from './subscription';
import * as flow from './flow';

export class AmbCoordinator<T> implements rs.Subscription {
    
    private subscribers: Array<AmbSubscriber<T>>;
    
    private winner: number = -1;
    
    private cancelled: boolean = false;
    
    constructor(private actual: rs.Subscriber<T>, private n: number) {
        const a = new Array<AmbSubscriber<T>>(n);
        for (var i = 0; i < n; i++) {
            a[i] = new AmbSubscriber(actual, i, this);
        }
        this.subscribers = a;
    }
    
    subscribe(sources: Array<rs.Publisher<T>>, n: number) : void {
        for (var i = 0; i < n; i++) {
            if (this.winner >= 0 || this.cancelled) {
                break;
            }
            sources[i].subscribe(this.subscribers[i]);
        }
    }
    
    request(n: number) : void {
        if (this.winner < 0) {
            for (var inner of this.subscribers) {
                inner.request(n);
            }
        } else {
            this.subscribers[n].request(n);
        }
    }
    
    cancel() : void {
        if (!this.cancelled) {
            this.cancelled = true;
            for (var inner of this.subscribers) {
                inner.cancel();
            }
        }
    }
    
    tryWinning(index: number) : boolean {
        if (this.winner >= 0) {
            return false;
        }
        this.winner = index;
        
        const a = this.subscribers;
        for (var i = 0; i < a.length; i++) {
            if (i != index) {
                a[i].cancel();
            }
        }
        return true;
    }
}

class AmbSubscriber<T> implements rs.Subscriber<T> {
    
    private winner: boolean = false;
    
    private s: rs.Subscription = null;
    
    private requested: number = 0;
    
    constructor(private actual: rs.Subscriber<T>, private index: number, private parent: AmbCoordinator<T>) {
        
    }
    
    onSubscribe(s: rs.Subscription) : void {
        if (sp.SH.validSubscription(this.s, s)) {
            this.s = s;
            const r = this.requested;
            this.requested = 0;
            if (r != 0) {
                s.request(r);
            }
        }
    }
    
    onNext(t: T) : void {
        if (this.winner) {
            this.actual.onNext(t);
        } else {
            if (this.parent.tryWinning(this.index)) {
                this.winner = true;
                this.actual.onNext(t);
            }
        }
    }
    
    onError(t: Error) : void {
        if (this.winner) {
            this.actual.onError(t);
        } else {
            if (this.parent.tryWinning(this.index)) {
                this.winner = true;
                this.actual.onError(t);
            } else {
                console.log(t);
            }
        }
    }
    
    onComplete() : void {
        if (this.winner) {
            this.actual.onComplete();
        } else {
            if (this.parent.tryWinning(this.index)) {
                this.winner = true;
                this.actual.onComplete();
            }
        }
    }
    
    request(n: number) : void {
        if (sp.SH.validRequest(n)) {
            const us = this.s;
            if (us == null) {
                this.requested += n;
            } else {
                us.request(n);
            }
        }        
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