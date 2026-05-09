import { Grid } from '@mui/material'
import Link from 'next/link'

const Trustpilot = () => {
  return (
    <section>
      <Grid container rowSpacing={{ xs: 6, sm: 6, md: 6 }} columnSpacing={{ xs: 3, sm: 4, md: 6 }} className="place-content-center place-items-center ">
      <Grid
        className='!min-w-fit'
        size={{
          xs: 1,
          sm: 1,
          md: 1
        }}>
        <Link href='https://www.trustpilot.com/review/unshortlink.com' rel='noopener noreferrer nofollow' target='_blank'>
        <img
          className="h-24"
          src="/images/Trustpilot-White.webp"
          alt="Trustpilot Reviews"
          loading="lazy"
        />
        </Link>
    
      </Grid>
      <Grid
        className='!min-w-fit'
        size={{
          xs: 1,
          sm: 1,
          md: 1
        }}>

      <a className='block' href="https://www.producthunt.com/posts/unshortlink?embed=true&utm_source=badge-featured&utm_medium=badge&utm_souce=badge-unshortlink" target="_blank" rel='noopener noreferrer nofollow'><img src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=474828&theme=neutral" alt="UnshortLink - Expand&#0032;URLs&#0032;&#0038;&#0032;links&#0032;and&#0032;know&#0032;what&#0032;you're&#0032;clicking | Product Hunt" width="250" height="54" loading="lazy" /></a>
      </Grid>

  </Grid>
    </section>
  );
}

export default Trustpilot
