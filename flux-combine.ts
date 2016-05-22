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

export class CombineLatest<R> implements rs.Subscription {

    private subscribers: CombineLatestInnerSubscriber<R>[];
    
    private cancelled: boolean;
    
    private requested: number;
    
    private queue: util.SpscLinkedArrayQueue<Object>;
    
    private wip: number;
    
    private latest: Object[];
    
    private active: number;
    
    private completed: number;
    
    private error: Error;
    
    constructor(private actual: rs.Subscriber<R>, 
            private combiner: (a: Object[]) => R, 
            prefetch : number, 
            n : number) {
        var a = new Array<CombineLatestInnerSubscriber<R>>(n);
        for (var i = 0; i < n; i++) {
            a[i] = new CombineLatestInnerSubscriber<R>(this, i, prefetch);
        }
        this.subscribers = a;
        this.cancelled = false;
        this.requested = 0;
        this.active = 0;
        this.completed = 0;
        this.error = null;
        this.wip = 0;
        this.queue = new util.SpscLinkedArrayQueue<Object>(prefetch);
        var b  = new Array<Object>(n);
        b.fill(null);
        this.latest = b;
        
    }
    
    subscribe(sources: rs.Publisher<Object>[], n: number) {
        var a = this.subscribers;
        for (var i = 0; i < n; i++) {
            if (this.cancelled) {
                break;
            }
            sources[i].subscribe(a[i]);
        }
    }
    
    request(n: number) : void {
        if (sp.SH.validRequest(n)) {
            this.requested += n;
            this.drain();
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
    
    innerNext(index: number, t: Object) : void {
        var c = this.latest;
        
        var a = this.active;
        if (c[index] == null) {
            a++;
            this.active = a;
        }
        c[index] = t;
        
        if (a == c.length) {
            this.queue.offer(index);
            this.queue.offer(c.slice());
            this.drain();
        } else {
            this.subscribers[index].requestOne();
        }
    }
    
    innerError(index: number, t: Error) : void {
        if (this.addError(t)) {
            this.drain();
        } else {
            console.log(t);
        }
    }
    
    innerComplete(index: number) : void {
        var a = this.latest;
        var n = a.length;
        if (a[index] == null) {
            this.completed = n;
            this.drain();
            return; 
        }
        if (this.completed < n) {
            if (++this.completed == n) {
                this.drain();
            }
        }
    }
    
    addError(t: Error) : boolean {
        var e = this.error;
            if (e != sp.SH.TERMINAL_ERROR) {
            if (e == null) {
                this.error = t;
            } else {
                this.error = new Error(e + "\n" + t);
            }
            return true;
        }
        return false;
    }
    
    drain() : void {
        if (this.wip++ != 0) {
            return;
        }
        
        var missed = 1;
        const q = this.queue;
        const a = this.actual;
        const subscribers = this.subscribers;
        const n = subscribers.length;
        const f = this.combiner;
        
        for (;;) {
            
            var r = this.requested;
            var e = 0;
            
            while (e != r) {
                if (this.cancelled) {
                    q.clear();
                    return;
                }
                
                const ex = this.error;
                if (ex != null) {
                    this.error = sp.SH.TERMINAL_ERROR;
                    this.cancel();
                    q.clear();
                    a.onError(ex);
                    return;
                }
                
                const index = q.poll();
                
                const empty = index == null;
                
                if (this.completed == n && empty) {
                    a.onComplete();
                    return;
                }
                
                if (empty) {
                    break;
                }
                
                const array = q.poll() as Array<Object>;
                
                var v;
                
                try {                
                    v = f(array);
                } catch (ex2) {
                    this.cancel();
                    this.addError(ex2);
                    continue;
                }
                
                if (v == null) {
                    this.cancel();
                    this.addError(new Error("The combiner function returned a null value"));
                    continue;
                }
                
                a.onNext(v);
                
                e++;
                subscribers[index as number].requestOne();
            }

            if (e == r) {
                if (this.cancelled) {
                    q.clear();
                    return;
                }
                
                const ex = this.error;
                if (ex != null) {
                    this.error = sp.SH.TERMINAL_ERROR;
                    this.cancel();
                    q.clear();
                    a.onError(ex);
                    return;
                }

                if (this.completed == n && q.isEmpty()) {
                    a.onComplete();
                    return;
                }                
            }
            
            
            missed = this.wip - missed;
            this.wip = missed;
            if (missed == 0) {
                break;
            }
        }
    }
}

class CombineLatestInnerSubscriber<R> implements rs.Subscriber<Object> {
    
    private s: rs.Subscription;
    
    private produced : number;
    
    private limit: number;
    
    constructor(private parent: CombineLatest<R>, private index: number, private prefetch : number) {
        this.s = null;
        this.produced = 0;
        this.limit = this.prefetch - (this.prefetch >> 2);
    }
    
    onSubscribe(s: rs.Subscription) : void {
        if (sp.SH.validSubscription(this.s, s)) {
            this.s = s;
            
            s.request(this.prefetch);
        }
    }
    
    onNext(t: Object) : void {
        this.parent.innerNext(this.index, t);
    }
    
    onError(t: Error) : void {
        if (this.s != sp.SH.CANCELLED) {
            this.s = sp.SH.CANCELLED;
            this.parent.innerError(this.index, t);
        }
    }
    
    onComplete() : void {
        if (this.s != sp.SH.CANCELLED) {
            this.s = sp.SH.CANCELLED;
            this.parent.innerComplete(this.index);
        }
    }
    
    cancel() : void {
        var a = this.s;
        if (a != sp.SH.CANCELLED) {
            this.s = sp.SH.CANCELLED;
            if (a != null) {
                a.cancel();
            }
        }
    }
    
    requestOne() : void {
        var p = this.produced + 1;
        if (p == this.limit) {
            this.produced = 0;
            this.s.request(p);
        } else {
            this.produced = p;
        }
    }
}