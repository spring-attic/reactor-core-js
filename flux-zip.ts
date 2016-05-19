import * as rs from './reactivestreams-spec';
import * as sp from './subscription';
import * as flow from './flow';
import * as util from './util';

export class ZipCoordinator<T, R> implements rs.Subscription {
    
    private subscribers: ZipInnerSubscriber<T, R>[];
    
    private requested: number;
    
    private wip: number;
    
    private cancelled: boolean;
    
    private error: Error;
    
    private row: T[];
    
    constructor(private actual: rs.Subscriber<R>, private zipper: (t: T[]) => R, private prefetch: number, n: number) {
        this.requested = 0;
        this.wip = 0;
        const a = new ZipInnerSubscriber[n];
        for (var i = 0; i < n; i++) {
            a[i] = new ZipInnerSubscriber<T, R>(this, prefetch, i);
        }
        this.subscribers = a;
        
        this.row = new Object[n].fill(null);
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
            
            if (this.wip++ == 0) {
                this.clearAll();
            }
        }
    }
    
    clearAll() : void {
        for (var inner of this.subscribers) {
            inner.cancel();
            inner.clear();
        }
    }
    
    subscribe(sources: rs.Publisher<T>[], n: number) {
        const a = this.subscribers;
        for (var i = 0; i < n; i++) {
            if (this.cancelled) {
                break;
            }
            sources[i].subscribe(a[i]);
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
    
    innerError(inner: number, t: Error) : void {
        if (this.addError(t)) {
            this.subscribers[inner].setDone();
            this.drain();
        } else {
            console.log(t);
        }
    }
    
    drain() : void {
        if (this.wip++ != 0) {
            return;
        }
        var missed = 1;
        const a = this.actual;
        const sa = this.subscribers;
        const n = sa.length;
        const row = this.row;
        
        for (;;) {
            const r = this.requested;
            var e = 0;
            
            outer:
            while (e != r) {
                if (this.cancelled) {
                    this.clearAll();
                    return;
                }
                
                const ex = this.error;
                if (ex != null) {
                    this.error = sp.SH.TERMINAL_ERROR;
                    this.clearAll();
                    a.onError(ex);
                    return;
                }
                
                var empty = false;
                
                for (var i = 0; i < n; i++) {
                    if (row[i] == null) {
                        var v;
                        
                        try {
                            v = sa[i].poll();
                        } catch (e) {
                            this.addError(e);
                            continue outer;
                        }
                        
                        empty = v == null;
                        
                        if (sa[i].isDone() && empty) {
                            this.clearAll();
                            
                            a.onComplete();
                            
                            return;
                        }
                        
                        if (empty) {
                            break;
                        }
                        
                        
                        row[i] = v;
                    }
                }
                
                if (empty) {
                    break;
                }
                
                var result: R;
                    
                try {
                    result = this.zipper(row.slice());
                } catch (e) {
                    this.addError(e);
                    continue outer;
                }
                
                if (result == null) {
                    this.addError(new Error("The zipper returned a null value"));
                    continue outer;
                }
                
                a.onNext(result);
                
                e++;
            }
            
            if (e == r) {
                if (this.cancelled) {
                    this.clearAll();
                    return;
                }
                
                const ex = this.error;
                if (ex != null) {
                    this.error = sp.SH.TERMINAL_ERROR;
                    this.clearAll();
                    a.onError(ex);
                    return;
                }
                
                var empty = false;
                
                for (var i = 0; i < n; i++) {
                    if (row[i] == null) {
                        var v;
                        
                        try {
                            v = sa[i].poll();
                        } catch (e) {
                            this.addError(e);
                            const ex0 = this.error;
                            if (ex0 != null) {
                                this.error = sp.SH.TERMINAL_ERROR;
                                this.clearAll();
                                a.onError(ex0);
                                return;
                            }
                        }
                        
                        empty = v == null;
                        
                        if (sa[i].isDone() && empty) {
                            this.clearAll();
                            
                            a.onComplete();
                            
                            return;
                        }
                        
                        if (empty) {
                            break;
                        }
                        
                        
                        row[i] = v;
                    }
                }
            }
            
            if (e != 0) {
                if (r != Infinity) {
                    this.requested -= e;
                }
                
                for (var s of sa) {
                    s.consumed(e);
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

class ZipInnerSubscriber<T, R> implements rs.Subscriber<T> {
    
    private s: rs.Subscription;
    
    private produced: number;
    
    private limit: number;
    
    private queue: flow.Queue<T>;
    
    private done : boolean;
    
    constructor(private parent: ZipCoordinator<T, R>, private prefetch: number, private index: number) {
        this.s = null;
        this.produced = 0;
        this.limit = prefetch - (prefetch >> 2);
        this.queue = new util.SpscArrayQueue<T>(prefetch);
    }
    
    onSubscribe(s: rs.Subscription) : void {
        if (sp.SH.validSubscription(this.s, s)) {
            this.s = s;
        }
    }
    
    onNext(t: T) : void {
        if (!this.queue.offer(t)) {
            this.onError(new Error("Zip queue full?!"));
            return;
        }
        this.parent.drain();
    }
    
    onError(t: Error) : void {
        this.parent.innerError(this.index, t);
    }
    
    onComplete() : void {
        this.done = true;
        this.parent.drain();
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
    
    consumed(n : number) {
        const p = this.produced + n;
        if (p >= this.limit) {
            this.produced = 0;
            this.s.request(p);
        } else {
            this.produced = p;
        }
    }
    
    clear() : void {
        this.queue.clear();
    }
    
    poll() : T {
        return this.queue.poll();
    }
    
    setDone() : void {
        this.done = true;
    }
    
    isDone() : boolean {
        return this.done;
    }
}