import * as rs from './reactivestreams-spec'
import * as sp from './subscription';
import * as flow from './flow';

export class UsingSubscriber<T, R> implements rs.Subscriber<T>, rs.Subscription {
    
    static subscribe<T, R>(actual: rs.Subscriber<T>, resourceFactory: () => R,
            publisherFactory: (resource: R) => rs.Publisher<T>,
            resourceDisposer: (resource: R) => void, eager : boolean) : void {
        var resource;
        
        try {
            resource = resourceFactory();
        } catch (ex) {
            sp.EmptySubscription.error(actual, ex);
            return;
        }
        
        var p;
        
        try {
            p = publisherFactory(resource);
        } catch (ex) {
            try {
                resourceDisposer(resource);
            } catch (ex2) {
                ex = new Error(ex + "\n" + ex2);
            }
            sp.EmptySubscription.error(actual, ex);
            return;
        }
        
        if (p == null) {
            try {
                resourceDisposer(resource);
            } catch (ex2) {
                sp.EmptySubscription.error(actual, ex2);
                return;
            }
            sp.EmptySubscription.error(actual, new Error("The publisherFactory returned a null Publisher"));
            return;            
        }
        
        p.subscribe(new UsingSubscriber(actual, resource, resourceDisposer, eager));
    }
    
    private s: rs.Subscription = null;
    
    private once: boolean = false;
    
    constructor(private actual: rs.Subscriber<T>, private resource: R, 
    private resourceDisposer: (resource: R) => void, private eager: boolean) {
        
    }
    
    onSubscribe(s: rs.Subscription) : void {
        if (sp.SH.validSubscription(this.s, s)) {
            this.s = s;
            
            this.actual.onSubscribe(this);
        }
    }
    
    onNext(t: T) : void {
        this.actual.onNext(t);
    }
    
    onError(t: Error) : void {
        if (this.eager) {
            if (!this.once) {
                this.once = true;
                try {
                    this.resourceDisposer(this.resource);
                } catch (ex) {
                    t = new Error(t + "\n" + ex);
                }
            }
        }
        
        this.actual.onError(t);
        
        if (!this.eager) {
            if (!this.once) {
                this.once = true;
                try {
                    this.resourceDisposer(this.resource);
                } catch (ex) {
                    console.log(ex);
                }
            }
        }
    }
    
    onComplete() : void {
        if (this.eager) {
            if (!this.once) {
                this.once = true;
                try {
                    this.resourceDisposer(this.resource);
                } catch (ex) {
                    this.actual.onError(ex);
                    return;
                }
            }
        }
        
        this.actual.onComplete();
        
        if (!this.eager) {
            if (!this.once) {
                this.once = true;
                try {
                    this.resourceDisposer(this.resource);
                } catch (ex) {
                    console.log(ex);
                }
            }
        }
    }
    
    request(n: number) : void {
        this.s.request(n);
    }
    
    cancel() : void {
        if (!this.once) {
            this.once = true;
            this.s.cancel();
            try {
                this.resourceDisposer(this.resource);
            } catch (ex) {
                console.log(ex);
            }
        }
    }
}