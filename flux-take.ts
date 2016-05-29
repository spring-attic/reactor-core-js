import * as rs from './reactivestreams-spec';
import * as flow from './flow';
import * as sp from './subscription';
import * as util from './util';

export class FluxTakeSubscriber<T> implements rs.Subscriber<T>, rs.Subscription {
    private mActual: rs.Subscriber<T>;
    private mRemaining : number;
    private once : boolean;
    private s: rs.Subscription;
    private done: boolean;
    
    constructor(n: number, actual: rs.Subscriber<T>) {
        this.mActual = actual;
        this.mRemaining = n;
        this.once = false;
        this.done = false;
    }
    
    onSubscribe(s: rs.Subscription) : void {
        if (sp.SH.validSubscription(this.s, s)) {
            this.s = s;
            this.mActual.onSubscribe(this);
        }
    }
    
    onNext(t: T) {
        if (this.done) {
            return;
        }
        
        var r = this.mRemaining;
        
        if (r == 0) {
            this.done = true;
            this.s.cancel();
            this.mActual.onComplete();
            return;
        }
        r--;
        
        this.mActual.onNext(t);
        
        if (r == 0 && !this.done) {
            this.done = true;
            this.s.cancel();
            this.mActual.onComplete();
            return;
        }
        
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
    
    request(n: number) : void {
        if (sp.SH.validRequest(n)) {
            if (!this.once) {
                this.once = true;
                if (n >= this.mRemaining) {
                    this.s.request(Infinity);
                    return;
                }
            }
            this.s.request(n);
        }
    }
    
    cancel() {
        this.s.cancel();
    }
}

export class FluxSkipSubscriber<T> implements rs.Subscriber<T>, rs.Subscription {
    private s: rs.Subscription;
    private remaining : number;
    
    constructor(private actual: rs.Subscriber<T>, private n : number) {
        this.remaining = n;
    }
    
    onSubscribe(s: rs.Subscription) : void {
        if (sp.SH.validSubscription(this.s, s)) {
            this.s = s;
            
            this.actual.onSubscribe(this);
            
            s.request(this.n);
        }    
    }
    
    onNext(t: T) : void {
        var r = this.remaining;
        if (r != 0) {
            r--;
            this.remaining = r;
            if (r != 0) {
                return;
            }
        }
        this.actual.onNext(t);
    }
    
    onError(t: Error) : void {
        this.actual.onError(t);
    }
    
    onComplete() : void {
        this.actual.onComplete();
    }
    
    request(n: number) {
        this.s.request(n);
    }
    
    cancel() : void {
        this.s.cancel();
    }
}

export class TakeLastSubscriber<T> implements rs.Subscriber<T>, rs.Subscription {
    
    private s: rs.Subscription = null;
    
    private requested: number = 0;
    
    private done: boolean = false;
    
    private queue: util.RingBuffer<T>;
    
    private cancelled: boolean = false;
    
    constructor(private actual: rs.Subscriber<T>, private n : number) {
        this.queue = new util.RingBuffer<T>(n);
    }
    
    onSubscribe(s: rs.Subscription) : void {
        if (sp.SH.validSubscription(this.s, s)) {
            this.s = s;
            
            this.actual.onSubscribe(this);
            
            s.request(Infinity);
        }
    }
    
    onNext(t: T) : void {
        this.queue.offer(t);
    }
    
    onError(t: Error) : void {
        this.queue.clear();
        this.actual.onError(t);
    }
    
    onComplete() : void {
        this.done = true;
        const r = this.requested;
        if (r != 0) {
            this.drain(r);
        }
    }
    
    request(n: number) : void {
        if (sp.SH.validRequest(n)) {
            const r = this.requested;
            this.requested = r + n;
            if (this.done && r == 0) {
                this.drain(n);
            }
        }
    }
    
    cancel() : void {
        if (!this.cancelled) {
            this.cancelled = true;
            this.queue.clear();
        }
    }
    
    drain(r : number) : void {
        const q = this.queue;
        const a = this.actual;
        for (;;) {
            var e = 0;
            while (e != r) {
                if (this.cancelled) {
                    return;
                }
                const v = q.poll();
                if (v == null) {
                    a.onComplete();
                    return;
                }
                a.onNext(v);
                
                e++;
            }
            
            if (r == e) {
                if (this.cancelled) {
                    return;
                }
                if (q.isEmpty()) {
                    a.onComplete();
                    return;
                }
            }
            
            if (r != Infinity) {
                r = this.requested - e;
                this.requested = r;
                if (r == 0) {
                    break;
                }
            }
        }
    }
}

export class TakeLastOneSubscriber<T> extends sp.DeferrendScalarSubscription<T> implements rs.Subscriber<T> {
    private s: rs.Subscription = null;
    
    private value: T = null;

    constructor(private actual: rs.Subscriber<T>) {
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
        this.value = t;
    }
    
    onError(t: Error) : void {
        this.actual.onError(t);
    }
    
    onComplete() : void {
        const v = this.value;
        if (v != null) {
            this.complete(v);
        } else {
            this.actual.onComplete();
        }
    }
    
    cancel() : void {
        super.cancel();
        this.s.cancel();        
    }
}

export class SkipLastSubscriber<T> implements rs.Subscriber<T>, rs.Subscription {
    private s: rs.Subscription = null;
    
    private queue: util.RingBuffer<T>;
    
    constructor(private actual: rs.Subscriber<T>, private n: number) {
        this.queue = new util.RingBuffer<T>(n);
    }

    onSubscribe(s: rs.Subscription) : void {
        if (sp.SH.validSubscription(this.s, s)) {
            this.s = s;
            
            this.actual.onSubscribe(this);
            
            s.request(this.n);
        }
    }
    
    onNext(t: T) : void {
        const q = this.queue;
        
        if (q.isFull()) {
            const v = q.poll();
            this.onNext(v);
        }
        q.offer(t);
    }
    
    onError(t: Error) : void {
        this.actual.onError(t);
    }
    
    onComplete() : void {
        this.actual.onComplete();
    }
    
    request(n: number) : void {
        this.s.request(n);
    }
    
    cancel() : void {
        this.s.cancel();
    }
    
}

export class TakeUntilMainSubscriber<T, U> implements rs.Subscriber<T>, rs.Subscription {
    private s: rs.Subscription = null;
    
    private other: TakeUntilOtherSubscriber<T, U>;
    
    private done: boolean = false;
    
    constructor(private actual: rs.Subscriber<T>) {
        this.other = new TakeUntilOtherSubscriber(this);
    }
    
    getOther() : rs.Subscriber<U> {
        return this.other;
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
        this.actual.onNext(t);
    }
    
    onError(t: Error) : void {
        if (this.done) {
            console.log(t);
            return;
        }
        this.done = true;
        this.other.cancel();
        this.actual.onError(t);
    }
    
    onComplete() : void {
        if (this.done) {
            return;
        }
        this.done = true;
        this.other.cancel();
        this.actual.onComplete();        
    }
    
    request(n: number) : void {
        this.s.request(n);        
    }
    
    cancel() : void {
        this.s.cancel();
        this.other.cancel();
    }
    
    otherSignal() : void {
        this.done = true;
        if (this.s == null) {
            this.s = sp.SH.CANCELLED;
            sp.EmptySubscription.complete(this.actual);
        } else {
            this.s.cancel();
            this.s = sp.SH.CANCELLED;
            this.actual.onComplete();
        }
    }
    
    otherError(t: Error) : void {
        if (this.done) {
            console.log(t);
            return;
        }
        this.done = true;
        if (this.s == null) {
            this.s = sp.SH.CANCELLED;
            sp.EmptySubscription.error(this.actual, t);
        } else {
            this.s.cancel();
            this.s = sp.SH.CANCELLED;
            this.actual.onError(t);
        }
    }
}

class TakeUntilOtherSubscriber<T, U> implements rs.Subscriber<U> {
    private s: rs.Subscription = null;
    
    private done: boolean = false;
    
    constructor(private main: TakeUntilMainSubscriber<T, U>) {
        
    }
    
    onSubscribe(s: rs.Subscription) : void {
        if (sp.SH.validSubscription(this.s, s)) {
            this.s = s;
            
            s.request(Infinity);
        }
    }
    
    onNext(t: U) : void {
        if (this.done) {
            return;
        }
        this.s.cancel();
        this.onComplete();
    }
    
    onError(t: Error) : void {
        if (this.done) {
            console.log(t);
            return;
        }
        this.done = true;
        this.main.otherError(t);
    }
    
    onComplete() : void {
        if (this.done) {
            return;
        }
        this.done = true;
        this.main.otherSignal();
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

export class SkipUntilMainSubscriber<T, U> implements rs.Subscriber<T>, rs.Subscription {
    private s: rs.Subscription = null;
    
    private other: SkipUntilOtherSubscriber<T, U>;
    
    private gate: boolean = false;
    
    private done: boolean = false;
    
    constructor(private actual: rs.Subscriber<T>) {
        this.other = new SkipUntilOtherSubscriber(this);
    }
    
    getOther() : rs.Subscriber<U> {
        return this.other;
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
        if (this.gate) {
            this.actual.onNext(t);
        } else {
            this.s.request(1);
        }
    }
    
    onError(t: Error) : void {
        if (this.done) {
            console.log(t);
            return;
        }
        this.done = true;
        this.other.cancel();
        this.actual.onError(t);
    }
    
    onComplete() : void {
        if (this.done) {
            return;
        }
        this.done = true;
        this.other.cancel();
        this.actual.onComplete();
    }
    
    request(n: number) : void {
        this.s.request(n);
    }
    
    cancel() : void {
        this.s.cancel();
        this.other.cancel();
    }

    otherSignal() : void {
        this.gate = true;
    }
    
    otherError(t: Error) : void {
        if (this.done) {
            console.log(t);
            return;
        }
        this.done = true;
        if (this.s == null) {
            this.s = sp.SH.CANCELLED;
            sp.EmptySubscription.error(this.actual, t);
        } else {
            this.s.cancel();
            this.s = sp.SH.CANCELLED;
            this.actual.onError(t);
        }
    }

}

class SkipUntilOtherSubscriber<T, U> implements rs.Subscriber<U> {
    private s: rs.Subscription = null;

    private done: boolean = false;

    constructor(private main: SkipUntilMainSubscriber<T, U>) {
        
    }

    onSubscribe(s: rs.Subscription) : void {
        if (sp.SH.validSubscription(this.s, s)) {
            this.s = s;
            
            s.request(Infinity);
        }
    }
    
    onNext(t: U) : void {
        if (this.done) {
            return;
        }
        this.s.cancel();
        this.onComplete();
    }
    
    onError(t: Error) : void {
        if (this.done) {
            console.log(t);
            return;
        }
        this.done = true;
        this.main.otherError(t);
    }
    
    onComplete() : void {
        if (this.done) {
            return;
        }
        this.done = true;
        this.main.otherSignal();
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