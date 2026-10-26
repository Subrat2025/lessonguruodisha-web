import StoreAuthMount from '@/components/store/WaAuthModal'

// Store-wide layout: mounts the WhatsApp OTP login popup once for all /store pages
// so requireLogin() can open it in place (and return the user to the same page).
export default function StoreLayout({ children }) {
  return (
    <>
      {children}
      <StoreAuthMount />
    </>
  )
}
