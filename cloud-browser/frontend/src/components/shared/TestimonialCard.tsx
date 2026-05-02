import { Box, Rating } from '@mui/material'
import StarIcon from '@mui/icons-material/Star';


const TestimonialCard = ({ review, reviewer }:any) => {
  return (
    <Box className='flex flex-col justify-start items-start p-5 gap-3 bg-light-gray dark:bg-dark-bg '>
        <Rating
            name="text-feedback"
            value={5}
            className='!text-primary-purple dark:!text-primary-purple-light'
            readOnly
            precision={0.5}
            emptyIcon={<StarIcon style={{ opacity: 0.55 }} fontSize="inherit" />}
        />
        <p className='text-sm leading-[1.5rem] dark:text-dark-secondary-text'>{review}</p>
        <p className='font-bold text-md'>{reviewer}</p>
    </Box>
  )
}

export default TestimonialCard
