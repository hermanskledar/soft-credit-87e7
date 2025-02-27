// src/pages/api/contact.js

export async function POST({ request }) {
  const formData = await request.json();
  
  // Validate the form data
  if (!formData.name || !formData.email || !formData.subject || !formData.message) {
    return new Response(
      JSON.stringify({
        success: false,
        message: 'Please fill out all required fields',
      }), 
      { 
        status: 400,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
  }
  
  try {
    // Here you would typically send an email or store the contact request
    // For Cloudflare, you might use:
    
    // Example: Send via email service (you'd need to set up environment variables)
    // const emailResult = await fetch('https://api.sendgrid.com/v3/mail/send', {
    //   method: 'POST',
    //   headers: {
    //     'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
    //     'Content-Type': 'application/json',
    //   },
    //   body: JSON.stringify({
    //     personalizations: [{ to: [{ email: 'your-email@example.com' }] }],
    //     from: { email: 'your-website@example.com' },
    //     subject: `Contact Form: ${formData.subject}`,
    //     content: [{ type: 'text/plain', value: `Name: ${formData.name}\nEmail: ${formData.email}\nMessage: ${formData.message}` }],
    //   }),
    // });
    
    // For now, we'll just simulate a successful response
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Message received! We will get back to you soon.',
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
    
  } catch (error) {
    console.error('Error handling contact form:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        message: 'There was a server error. Please try again later.',
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
  }
}
