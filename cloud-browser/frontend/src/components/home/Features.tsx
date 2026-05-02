import { Box, Grid } from '@mui/material'
import Card from '../shared/Card'
import { useTranslations } from 'next-intl';



const Features = () => {

  const t = useTranslations('home.features');

  const data = [
    {
        title: t('wheregoes'),
        description: t('wheregoes-description'),
        image: '/images/UnshortenURL.png',
        alt: 'Expand URL'
    },
    {
        title: t('phishing-detection'),
        description: t('phishing-detection-description'),
        image: '/images/Phishing-Detection.png',
        alt: 'Unsafe Links'
    },
    {
        title: t('privacy-guard'),
        description: t('privacy-guard-description'),
        image: '/images/Privacy-Guard.png',
        alt: 'Privacy Guard'
    },
    {
        title: t('integrations-api'),
        description: t('integrations-api-description'),
        image: '/images/Integrations-API.png',
        alt: 'API Integration'
    },
    {
        title: t('borwser-extension'),
        description: t('borwser-extension-description'),
        image: '/images/Browser-Extension.png',
        comingSoon: true,
        alt: 'Link Redirect Extension'
    },
    {
        title: t('live-preview'),
        description: t('live-preview-description'),
        image: '/images/Live-Preview.png',
        alt: 'Live Preview'
    },
]
 
  return (
    <section className='w-full flex flex-col items-center gap-16'>
      <Box className='flex flex-col text-[35px] leading-[45px] md:leading-[50px]  md:text-[40px] font-extrabold text-center' sx={{
        width: {md:'60%', sm:'70%', xs:'90%'}
      }}>
        <h2>{t('title')}</h2>
      </Box>
      <Box sx={{ width: '100%' }}>
      <Grid container rowSpacing={{ xs: 2, sm: 2, md: 3 }} columnSpacing={{ xs: 1, sm: 2, md: 3 }}>
        {data.map((item, index) => (
          <Grid
            key={index}
            size={{
              xs: 12,
              sm: 6,
              md: 6,
              xl: 4
            }}>
            <Card {...item} />
          </Grid>
        ))}
      </Grid>
    </Box>
    </section>
  );
}

export default Features
