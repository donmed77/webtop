import { Box } from '@mui/material'
import { useTranslations } from 'next-intl';

const Card = ({ title, alt, description, image, comingSoon, newFeature, link }:any) => {

  const t = useTranslations('home.features');
  
  return (
    <Box className='flex flex-col items-center justify-center p-5 gap-3 bg-light-gray dark:bg-dark-bg  h-[376px]'>
      <div className='h-[145px]'>
        <img src={image} alt={alt} className=' h-[145px]' />
      </div>
        <h3 className='text-center font-bold text-[26px]'>{title}</h3>
        <p className='text-center text-[14px] leading-[1.7rem] dark:text-dark-secondary-text mt-3'>{description}</p>
        { comingSoon ? 
          <p className='text-center font-light text-[0.6rem] border py-1 px-3 border-dark-secondary-text dark:text-dark-secondary-text'>{t('coming-soon')}</p>
          : newFeature ? (
            <a href={link} target='_blank' className='text-center font-light text-[0.6rem] border py-1 px-3 text-white bg-primary-purple dark:bg-primary-purple-light'>{t('new-release')}</a>
          ) : 
          <p className='text-center font-light opacity-0 text-[0.6rem] border py-3 px-3 border-dark-secondary-text dark:text-dark-secondary-text'></p>
        }
    </Box>
  )
}

export default Card
