import { useEffect } from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import type { LegalPage } from '../legal';

// Same typography as the footer's policy popup, laid out as a full page.
export default function Legal({ page }: { page: LegalPage }) {
  useEffect(() => {
    document.title = `${page.title} — CoverShift`;
    window.scrollTo(0, 0);
  }, [page]);

  return (
    <>
      <Navbar />
      {/* Dark band under the see-through navbar, like the landing hero. */}
      <div className="bg-navy-4 pt-[120px] pb-12">
        <div className="container-lg px-6 md:px-10 lg:px-16">
          <h1 className="sm:max-w-3xl mx-auto font-display font-extrabold text-[26px] sm:text-[32px] text-white">{page.title}</h1>
        </div>
      </div>
      <main className="bg-paper pb-16">
        <div className="container-lg px-6 md:px-10 lg:px-16">
          <article className="bg-white sm:max-w-3xl mx-auto -mt-6 rounded-2xl shadow-sm border border-line px-6 sm:px-10 py-8 sm:py-10">
            <div className="space-y-5">
              {page.body.map((para, i) => {
                const [heading, ...rest] = para.split('\n');
                return rest.length > 0 ? (
                  <section key={i}>
                    <h2 className="font-bold text-[15px] text-ink mb-1">{heading}</h2>
                    <p className="text-[14px] text-slate leading-relaxed whitespace-pre-line">{rest.join('\n')}</p>
                  </section>
                ) : (
                  <p key={i} className={`leading-relaxed ${i === 0 ? 'text-slate/60 text-[12px]' : 'text-[14px] text-slate'}`}>{para}</p>
                );
              })}
            </div>
          </article>
        </div>
      </main>
      <Footer />
    </>
  );
}
