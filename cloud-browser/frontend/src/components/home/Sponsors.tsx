import { Box, Link } from '@mui/material'
import { useTranslations } from 'next-intl';

const Sponsors = () => {

  const t = useTranslations('home.sponsors');

  return (
    <section className='w-full flex flex-col items-center gap-8 md:gap-16' id='sponsors'>
      <Box className='flex flex-col text-[35px] leading-[45px] md:leading-[50px]  md:text-[40px] font-extrabold text-center' sx={{
        width: {md:'60%', sm:'70%', xs:'90%'}
      }}>
     <h2>{t('title')}</h2> 
      </Box>
      <div className='py-[45px] px-[88px] bg-light-gray dark:bg-dark-bg'>
          <Link href='https://cutt.ly' target='_blank' rel='noopener noreferrer sponsored'>
              <img className=' cursor-pointer h-14 dark:hidden block' src="/images/Cuttly.colored.png" alt="Cuttly logo" />
              <img className=' cursor-pointer h-14 hidden dark:block' src="/images/Cuttly-White.png" alt="Cuttly logo" />
          </Link>
      </div>
    </section>
  );
}

export default Sponsors
