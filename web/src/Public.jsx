import { api } from './api.js';
import { BUSINESS, Status, rupees, telHref, useLoad, waHref } from './ui.jsx';

// What customers see without signing in: what we sell, regular prices and how to reach us.
export default function Public() {
  const { data, ...status } = useLoad(() => api('GET', '/public'));
  return (
    <main className="side-grad min-h-full p-4">
      <div className="mx-auto max-w-xl space-y-4 py-6">
        <div className="text-white">
          <h1 className="font-display text-3xl font-extrabold tracking-tight">{BUSINESS}</h1>
          <p className="mt-1 text-white/85">Drinking water in jars and bottles, delivered.</p>
        </div>
        <Status {...status} />
        {data && (
          <>
            {data.about && <p className="card whitespace-pre-line">{data.about}</p>}
            <section className="card space-y-1 p-0">
              <h2 className="px-5 pt-5 pb-2 font-display text-lg font-bold">What we sell</h2>
              {data.products.map((p) => (
                <div key={p.key} className="flex items-center justify-between border-t border-line px-5 py-3">
                  <span className="font-semibold">{p.name}</span>
                  <span className="font-display text-lg font-bold text-accent">{p.price ? rupees(p.price) : 'Ask us'}</span>
                </div>
              ))}
              <p className="border-t border-line px-5 py-3 text-xs text-muted">Jars and bottles are returnable. Party and bulk orders: call us for prices.</p>
            </section>
            {(data.phone || data.address) && (
              <section className="card space-y-3">
                <h2 className="font-display text-lg font-bold">Contact</h2>
                {data.address && <p className="whitespace-pre-line text-muted">{data.address}</p>}
                {data.phone && (
                  <div className="grid grid-cols-2 gap-3">
                    <a className="btn btn-primary" href={telHref(data.phone)}>Call {data.phone}</a>
                    <a className="btn" href={waHref(data.phone, `Hello ${BUSINESS}, I would like to order water.`)} target="_blank" rel="noreferrer">WhatsApp</a>
                  </div>
                )}
              </section>
            )}
          </>
        )}
        <a href="#/" className="block text-center text-sm text-white/85 underline">Staff sign in</a>
      </div>
    </main>
  );
}
