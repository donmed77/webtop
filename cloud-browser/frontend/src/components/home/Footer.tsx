import { Button, Typography } from '@mui/material';
import Link from 'next/link';
import Logo from '@/assets/unshortlink_logo.svg'
import LogoWhite from '@/assets/unshortlink_logo_white.svg'
import { useTranslations } from 'next-intl';

const Footer = () => {

  const t = useTranslations('shared');

 const pages = [
  {
    name: t('privacy'),
    path: "/privacy",
  },
  {
      name: t('terms'),
      path: "/terms",
  },
]

  return (
    <footer id='footer' className='pb-10 flex flex-col gap-8 items-center w-full overflow-visible bg-white  dark:bg-primary-navy absolute bottom-0'>
      <div className='max-w-[1280px] flex items-start w-full mb-4 px-3 md:px-6 xl:px-0  '>
      <ul className='flex gap-1 lg:gap-8'>
                  {pages.map((page, index) => (
                    <li key={index}>
                      <Link
                        key={page.name}
                        href={page.path}
                      >
                        <Button
                          className=" hover:!bg-white dark:hover:!bg-primary-navy !min-w-fit !font-medium text-sm !w-fit !border-0 dark:!text-white gap-1 !duration-0 !text-primary-navy flex  items-center justify-center !p-3 !pr-5   dark:!border-zinc-600"
                          style={{ borderRadius: 0, boxShadow: "unset"}}
                          variant="outlined"
                          color="primary"
                          onClick={() => {}}
                        >
                          <Typography className='!text-[16px] !font-medium' sx={{
                            fontWeight: 500
                          }}>
                            {page.name}
                          </Typography>
                        </Button>
                          

                      </Link>
                    </li>
                  ))}
                </ul>
      </div>
      <div className='h-[1px] bg-zinc-200 dark:bg-zinc-600  w-full'/>
      <div className='px-3 md:px-6 xl:px-0 w-full flex justify-between gap-4 md:flex-row flex-col-reverse max-w-[1280px] '>
          <div className='flex flex-col  md:text-start md:items-start gap-4 mt-4 w-full md:w-[40%]'>
            <Link href='/'>
            <div className='block dark:hidden'>
                <Logo />
            </div>
            <div className='hidden dark:block'>
                <LogoWhite />
            </div>
            </Link>
              <Typography className='font-normal text-[15px]'>{t('footer-description')}</Typography>
              <Typography className='font-normal text-[15px]'>© 2026 Unshort_Link</Typography>
              <div className='flex gap-3'>

              <Button
                  className=" !p-0 !border-none !min-w-fit !w-fit !duration-0 !rounded-full "
                  style={{ borderRadius: 0, boxShadow: "unset" }}
                  variant="outlined"
                  color="primary"
                >
                  <Link href='https://www.facebook.com/unshortlink/' target='_blank' rel='noopener noreferrer'>
                    <img className=' h-10 dark:hidden block' src="/images/Facebook-icon.png" alt="Facebook icon" />
                    <img className=' h-10 hidden dark:block' src="/images/Facebook-icon-white.png" alt="Facebook icon" />
                  </Link>
           
                </Button>


              <Button
                  className=" !p-0 !border-none !min-w-fit !w-fit !duration-0 !rounded-full "
                  style={{ borderRadius: 0, boxShadow: "unset" }}
                  variant="outlined"
                  color="primary"
                >
                  <Link href='https://x.com/unshortlink' target='_blank' rel='noopener noreferrer'>
                  <img className=' h-10 dark:hidden block' src="/images/X-icon.png" alt="X icon" />
                  <img className=' h-10 hidden dark:block' src="/images/X-icon-white.png" alt="X icon" />
                  </Link>

                </Button>

              <Button
                  className=" !p-0 !border-none !min-w-fit !w-fit !duration-0 !rounded-full "
                  style={{ borderRadius: 0, boxShadow: "unset" }}
                  variant="outlined"
                  color="primary"
                >
                  <Link
                    href='https://discord.gg/unshortlink'
                    target='_blank'
                    rel='noopener noreferrer'
                    aria-label='Discord'
                    className='flex h-10 w-10 items-center justify-center rounded-full bg-[#171717] dark:bg-white'
                  >
                    <svg
                      viewBox='0 0 24 24'
                      aria-hidden='true'
                      className='h-5 w-5 fill-white dark:fill-[#171717]'
                    >
                      <path d='M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z' />
                    </svg>
                  </Link>

                </Button>




              </div>
          </div>

          <div className='flex flex-col  gap-2' id='sponsors'>
              <h2 className='text-lg md:text-xl'>{t('partner')}</h2> 
              <div>
                  <Link href='https://cutt.ly' target='_blank' rel='noopener noreferrer sponsored'>
                  <img className=' cursor-pointer h-14 dark:hidden block' src="/images/Cuttly.colored.png" alt="Cuttly logo" />
                  <img className=' cursor-pointer h-14 hidden dark:block' src="/images/Cuttly-White.png" alt="Cuttly logo" />
                  </Link>
              </div>
          </div>

      </div>
    </footer>
  );
}

export default Footer
