import { Button, Drawer, Typography } from '@mui/material'
import React, { startTransition, useState } from 'react'
import Link from 'next/link'
import MenuIcon from '@mui/icons-material/Menu';
import Close from '@mui/icons-material/Close';
import useThemeStore from '@/stores/theme-store';
import Logo from '@/assets/unshortlink_logo.svg'
import LogoWhite from '@/assets/unshortlink_logo_white.svg'
import { usePathname, useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';

const Navbar = () => {

  const [open, setOpen] = useState(false)
  const [langOpen, setLangOpen] = useState(false)
  const { theme } = useThemeStore();

  const t = useTranslations('shared');

 const statusDot = theme == 'light' ? <div className='status-dot-primary'/> : <div className='status-dot-secondary'/>
//  const statusDot = <div className='status-dot-primary'/>
 const pages: { name: string; path: string; blank?: boolean; new?: boolean; icon?: React.ReactNode }[] = [
  {
    name: t('about'),
    path: "#faq",
  },
  {
    name: t('contact'),
    path: "mailto:contact@unshortlink.com",
  },
  {
      name: t('sponsor'),
      path: "#sponsors",
  },
  {
      name: t('status'),
      path: "https://status.unshortlink.com/",
      blank: true,
      icon: statusDot
  },
  // {
  //     name: 'API',
  //     path: "https://portal.unshortlink.com/pricing/",
  //     blank: true,
  //     new: true
  // },

]



const languages = [
  { label: "English", flag: "us", lang: "en" },
  { label: "Français", flag: "fr", lang: "fr" },
]


 const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const onSelectChange = (event: any) => {
    const nextLocale = event.target.value;



    // document.cookie = `NEXT_LOCALE=${nextLocale}; path=/`;
    // router.refresh();
    startTransition(() => {
      // Construct the new pathname with the selected language
      // refactor pathname to remove the old locale
      const refactoredPathname = pathname.replace(`/${locale}`, '');
      const newPathname = `/${nextLocale}${refactoredPathname}`;
      console.log(newPathname)
      // Push the new locale path to the router
      router.push(newPathname);
    });
  };

  return (
    <nav className='sticky z-[1000] top-0 left-0 right-0 flex items-center w-full justify-center '>
      <div className=' absolute z-20 w-full top-0  !h-[90px] !min-h-[90px] max-w-[1280px] px-3 md:px-6 xl:px-0  bg-white  dark:bg-primary-navy flex justify-between py-[18px] items-center'>
      <Link href='/'>
      <div className='block dark:hidden'>
            <Logo />
        </div>
        <div className='hidden dark:block'>
            <LogoWhite />
        </div>
      </Link>

          <ul className='hidden lg:flex gap-1 lg:gap-8'>
            {pages.map((page, index) => (
              <li key={index}>
                <Link
                  key={page.name}
                  href={page.path}
                  target={page.blank ? '_blank' : '_self'}
                  rel={page.blank ? 'noopener noreferrer nofollow' : '' }
                >
                  <Button
                    className=" hover:!bg-white dark:hover:!bg-primary-navy !min-w-fit !font-medium text-sm !w-fit !border-0 dark:!text-white gap-1 !duration-0 !text-primary-navy flex  items-center justify-center !p-3 !pr-5   dark:!border-zinc-600"
                    style={{ borderRadius: 0, boxShadow: "unset"}}
                    variant="outlined"
                    color="primary"
                    onClick={() => {}}
                  >
                  <div className='max-w-[18px] flex gap-1 items-center justify-center'>
                      {page.icon && (
                        <div className='mr-1 mb-[2px]'>
                          {page.icon}
                        </div>
                      )}
                    </div>
                    <Typography className='!text-[16px] !font-medium' sx={{
                      fontWeight: 500
                    }}>
                      {page.name}
                    </Typography>
                    {page.new && (
                      <div className='ml-1'>
                        <div className='bg-primary-purple dark:bg-primary-purple-light text-white text-[8px] font-medium px-1 py-1 leading-none'>{t('new')}</div>
                      </div>
                    )}
                  </Button>


                </Link>
              </li>
            ))}
          </ul>

          <div className='hidden lg:flex gap-2 items-center select-none'>
              <a href="https://discord.gg/unshortlink" target="_blank" rel="noopener noreferrer">
                <Button
                  className="hover:!bg-white dark:hover:!bg-primary-navy !min-w-fit !w-fit !border-0 dark:!text-white !duration-0 !text-primary-navy !p-3"
                  style={{ borderRadius: 0, boxShadow: "unset" }}
                  variant="outlined"
                  color="primary"
                  aria-label="Join our Discord"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                  </svg>
                </Button>
              </a>

              <div className='relative'>
                <Button
                  className="hover:!bg-white dark:hover:!bg-primary-navy !min-w-fit !w-fit !border-0 dark:!text-white !duration-0 !text-primary-navy flex gap-2 items-center !p-3"
                  style={{ borderRadius: 0, boxShadow: "unset" }}
                  variant="outlined"
                  color="primary"
                  onClick={() => setLangOpen(v => !v)}
                >
                  {(() => { const l = languages.find(l => l.lang === locale); return l ? <><img src={`https://flagcdn.com/w20/${l.flag}.png`} alt={l.label} className='w-4 h-auto' /><Typography className='!text-[16px] !font-medium'>{l.label}</Typography><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="-ml-1"><path d="M7 10l5 5 5-5z"/></svg></> : null; })()}
                </Button>
                {langOpen && (
                  <>
                    <div className='fixed inset-0 z-40' onClick={() => setLangOpen(false)} />
                    <div className='absolute top-full right-0 z-50 bg-white dark:bg-primary-navy border border-zinc-200 dark:border-zinc-600 min-w-full'>
                      {languages.map((lang) => (
                        <button
                          key={lang.lang}
                          className='flex gap-2 items-center w-full px-3 py-3 text-primary-navy dark:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 text-sm font-medium'
                          onClick={() => { setLangOpen(false); onSelectChange({ target: { value: lang.lang } }); }}
                        >
                          <img src={`https://flagcdn.com/w20/${lang.flag}.png`} alt={lang.label} className='w-4 h-auto' />
                          {lang.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

          </div>


          <div className='block lg:hidden'>
          <Button
                  className=" hover:!bg-white dark:hover:!bg-primary-navy !min-w-fit !font-medium text-sm !w-fit !border-0 dark:!text-white !duration-0 !text-primary-navy flex gap-2 items-center justify-center !p-3   dark:!border-zinc-600"
                  style={{ borderRadius: 0, boxShadow: "unset"}}
                  variant="outlined"
                  color="primary"
                  onClick={() => setOpen(true)}
                >
            <MenuIcon className='!w-[2rem] !h-[2rem]'/>
            </Button>
          </div>


      </div>
      <div className='h-[1px] bg-zinc-200 dark:bg-zinc-600  w-full mt-[90px]'/>
      <Drawer
      anchor={'top'}
      open={open}
      onClose={() => setOpen(false)}
      slotProps={{ paper: { sx: { overflow: 'visible' } } }}
    >

      <div className='bg-white w-[100vw] dark:bg-primary-navy h-fit !min-w-full'>
        <div className='!w-full flex flex-col py-5 relative'>
        <div className='h-[1px] bg-zinc-100 dark:bg-zinc-600  w-full mt-[90px] absolute top-0'/>
          <div className='flex justify-between items-center px-3 md:px-6'>
            <div className=' ml-[2px]'>
            <Link href='/'>
                <div className='block dark:hidden'>
                    <Logo />
                </div>
                <div className='hidden dark:block'>
                    <LogoWhite />
                </div>
            </Link>

            </div>
            <Button
                  className=" hover:!bg-white dark:hover:!bg-primary-navy !min-w-fit !font-medium text-sm !w-fit !border-0 dark:!text-white !duration-0 !text-primary-navy flex gap-2 items-center justify-center !p-3   dark:!border-zinc-600"
                  style={{ borderRadius: 0, boxShadow: "unset"}}
                  variant="outlined"
                  color="primary"
                  onClick={() => setOpen(false)}
                >
            <Close className='!w-[2rem] !h-[2rem]'/>
            </Button>

          </div>


          <ul className='flex flex-col py-4'>
              {pages.map((page) => (
                <li key={page.name}>
                <Link

                href={page.path}
                target={page.blank ? '_blank' : '_self'}
                onClick={() => setOpen(false)}
              >
                <Button
                  className=" hover:!bg-white dark:hover:!bg-primary-navy  !font-medium !grid !place-content-start text-sm !border-l-0 ! border-r-0 !border-t-0 ! !border-zinc-200 dark:!text-white !duration-0 !text-primary-navy gap-2 !px-3 md:!px-6 !py-5   dark:!border-zinc-600"
                  style={{ borderRadius: 0, boxShadow: "unset"}}
                  variant="outlined"
                  color="primary"
                  fullWidth
                  onClick={() => {}}
                >
                  <div className='flex gap-2 items-center justify-center'>
                  {page.icon && (
                      <div className='ml-1 mb-[2px]'>
                        {page.icon}
                      </div>
                    )}

                  <Typography className='!text-[14px] !font-medium' sx={{
                    fontWeight: 500
                  }}>
                     {page.name}
                  </Typography>

                  {page.new && (
                      <div className=''>
                        <div className='bg-primary-purple dark:bg-primary-purple-light text-white text-[8px] font-medium px-1 py-1 leading-none'>{t('new')}</div>
                      </div>
                    )}

                  </div>
                </Button>


              </Link>

                </li>
              ))}
            </ul>

          <div className='gap-2 items-center px-3 md:px-6 mt-1 flex'>

              <div className='relative'>
                <Button
                  className="hover:!bg-white dark:hover:!bg-primary-navy !min-w-fit !w-fit !border-0 dark:!text-white !duration-0 !text-primary-navy flex gap-2 items-center !p-3"
                  style={{ borderRadius: 0, boxShadow: "unset" }}
                  variant="outlined"
                  color="primary"
                  onClick={() => setLangOpen(v => !v)}
                >
                  {(() => { const l = languages.find(l => l.lang === locale); return l ? <><img src={`https://flagcdn.com/w20/${l.flag}.png`} alt={l.label} className='w-4 h-auto' /><Typography className='!text-[16px] !font-medium'>{l.label}</Typography><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="-ml-1"><path d="M7 10l5 5 5-5z"/></svg></> : null; })()}
                </Button>
                {langOpen && (
                  <>
                    <div className='fixed inset-0 z-40' onClick={() => setLangOpen(false)} />
                    <div className='absolute top-full left-0 z-50 bg-white dark:bg-primary-navy border border-zinc-200 dark:border-zinc-600 min-w-full'>
                      {languages.map((lang) => (
                        <button
                          key={lang.lang}
                          className='flex gap-2 items-center w-full px-3 py-3 text-primary-navy dark:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 text-sm font-medium'
                          onClick={() => { setLangOpen(false); onSelectChange({ target: { value: lang.lang } }); }}
                        >
                          <img src={`https://flagcdn.com/w20/${lang.flag}.png`} alt={lang.label} className='w-4 h-auto' />
                          {lang.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

                                  <a href="https://discord.gg/unshortlink" target="_blank" rel="noopener noreferrer">
                <Button
                  className="hover:!bg-white dark:hover:!bg-primary-navy !min-w-fit !w-fit !border-0 dark:!text-white !duration-0 !text-primary-navy !p-3"
                  style={{ borderRadius: 0, boxShadow: "unset" }}
                  variant="outlined"
                  color="primary"
                  aria-label="Join our Discord"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                  </svg>
                </Button>
              </a>
          </div>
          </div>
      </div>


    </Drawer>
    </nav>
  );
}

export default Navbar
