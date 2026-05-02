
import Hero from '@/components/home/Hero'
import Features from "@/components/home/Features";
import Stats from "@/components/home/Stats";
import Sponsors from "@/components/home/Sponsors";
import Testimonials from "@/components/home/Testimonials";
import Trustpilot from "@/components/home/Trustpilot";
import FAQ from "@/components/home/FAQ";
import { Graph } from "schema-dts";
import { getTranslations } from 'next-intl/server';


export default async function App({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;

  const t = await getTranslations({ locale, namespace: 'home.faq' });
  const t2 = await getTranslations({ locale, namespace: 'meta' });

  

  const jsonLd: Graph =   {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebApplication",
        "@id": "https://unshortlink.com/",
        "applicationCategory": "UtilitiesApplication",
        "operatingSystem": "Web",
        "name": t2('title'),
        "description": t2('description'),
        "url": "https://unshortlink.com",
        "image": {
          "@type": "ImageObject",
          "url": "/share_landscape.png"
        },
        "sameAs": [
          "https://www.facebook.com/unshortlink",
          "https://www.x.com/unshortlink"
        ],
        "author": {
          "@type": "Person",
          "name": "Mohamed Kazane"
        }
      },
      {
        "@type": "FAQPage",
        "@id": "https://unshortlink.com/#faq",
        "mainEntity": [
          {
            "@type": "Question",
            "name": t('question-1'),
            "acceptedAnswer": {
              "@type": "Answer",
              "text": t('answer-1')
            }
          },
          {
            "@type": "Question",
            "name": t('question-2'),
            "acceptedAnswer": {
              "@type": "Answer",
              "text": t('answer-2')
            }
          },
          {
            "@type": "Question",
            "name": t('question-3'),
            "acceptedAnswer": {
              "@type": "Answer",
              "text": t('answer-3')
            }
          },
          {
            "@type": "Question",
            "name": t('question-4'),
            "acceptedAnswer": {
              "@type": "Answer",
              "text": t('answer-4')
            }
          },
          {
            "@type": "Question",
            "name": t('question-5'),
            "acceptedAnswer": {
              "@type": "Answer",
              "text": t('answer-5')
            }
          },
          {
            "@type": "Question",
            "name": t('question-6'),
            "acceptedAnswer": {
              "@type": "Answer",
              "text": t('answer-6')
            }
          },
          {
            "@type": "Question",
            "name": t('question-7'),
            "acceptedAnswer": {
              "@type": "Answer",
              "text": t('answer-7')
            }
          },
          {
            "@type": "Question",
            "name": t('question-8'),
            "acceptedAnswer": {
              "@type": "Answer",
              "text": t('answer-8')
            }
          },
          {
            "@type": "Question",
            "name": t('question-9'),
            "acceptedAnswer": {
              "@type": "Answer",
              "text": t('answer-9')
            }
          },
          {
            "@type": "Question",
            "name": t('question-10'),
            "acceptedAnswer": {
              "@type": "Answer",
              "text": t('answer-10')
            }
          }
        ]
      }
    ]
  }

  return (
    <>
    <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        key="product-jsonld"
      />
    <main className="flex flex-col py-10 gap-20 relative select-none">
      <Hero />
      <Features />
      <Stats />
      <Sponsors />
      <Testimonials />
      <Trustpilot />
      <FAQ />
    </main>
    </>
  );
}
