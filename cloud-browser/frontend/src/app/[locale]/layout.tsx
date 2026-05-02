import LandingLayoutWrapper from "./LandingLayoutWrapper";
import {NextIntlClientProvider} from 'next-intl';
import {getMessages} from 'next-intl/server';
import {notFound} from 'next/navigation';
import {routing} from '@/i18n/routing';
import {getTranslations} from 'next-intl/server';

import { Poppins } from 'next/font/google';

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['300', '400', '500', '700', '800'],
  variable: "--poppins",
  display: 'swap',
})

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta' });

  const siteUrl = 'https://unshortlink.com';
  const title = t('title', {
    defaultValue: 'Unshorten URL - Expand URL | Link Redirect Trace',
  });
  const description = t('description', {
    defaultValue:
      'Unshorten Link and browse safely. Know Unshorten URL your link before you click open. Expand URL and get the original link. More than a Link redirect trace.',
  });

  return {
    title,
    description,
    alternates: {
      languages: {
        'x-default': `${siteUrl}/`,
        en: `${siteUrl}/`,
        fr: `${siteUrl}/fr`,
      },
      canonical: locale == 'en' ? `${siteUrl}/` : `${siteUrl}/${locale}`,
    },
    openGraph: {
      title,
      description,
    },
    twitter: {
      title,
      description,
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{locale: string}>;
}) {
  const { locale } = await params;

  if (!routing.locales.includes(locale as any)) {
    notFound();
  }

  const messages = await getMessages();

  return (
    <div className={`${poppins.className} bg-white dark:bg-primary-navy text-primary-navy dark:text-white`}>
      <NextIntlClientProvider messages={messages}>
        <LandingLayoutWrapper>
          {children}
        </LandingLayoutWrapper>
      </NextIntlClientProvider>
    </div>
  );
}
