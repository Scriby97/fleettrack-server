import { RealtimeService } from './realtime.service';

describe('RealtimeService', () => {
  let service: RealtimeService;

  beforeEach(() => {
    service = new RealtimeService();
  });

  it('delivers a "changed" event only to subscribers of the published organization', (done) => {
    const received: unknown[] = [];

    const sub = service.streamForOrganization('org-a').subscribe((event) => {
      received.push(event.data);
      sub.unsubscribe();
      expect(received).toEqual([{ type: 'changed' }]);
      done();
    });

    // Falsche Organisation zuerst - darf den obigen Subscriber nicht ausloesen.
    service.publish('org-b');
    service.publish('org-a');
  });

  it('does not leak an event to a subscriber of a different organization', () => {
    const receivedA: unknown[] = [];
    const subA = service.streamForOrganization('org-a').subscribe((event) => {
      receivedA.push(event.data);
    });

    service.publish('org-b');

    subA.unsubscribe();
    expect(receivedA).toEqual([]);
  });
});
