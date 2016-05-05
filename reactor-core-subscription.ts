import * as rs from './reactivestreams-spec';

export class EmptySubscription implements rs.Subscription {
    request(n: number) : void {
        // deliberately ignored
    }
    
    cancel() : void {
        // deliberately ignored
    }
    
    complete(s : rs.Subscriber<any>) : void {
        s.onSubscribe(EmptySubscription.INSTANCE);
        s.onComplete();
    }
    
    error(s : rs.Subscriber<any>, e : Error) : void {
        s.onSubscribe(EmptySubscription.INSTANCE);
        s.onError(e);
    }
    
    public static INSTANCE : rs.Subscription = new EmptySubscription();
}