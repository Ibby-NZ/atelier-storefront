// Bespoke (made-to-measure) programme — the five houses whose ateliers take
// custom commissions, per the client's brief of 10 Aug 2026. Nothing here
// carries a price: every bespoke piece is quoted by the back office, and the
// quote validity note below must appear wherever an enquiry is invited.
//
// Pure data + helpers so the island stays thin and this file is unit-testable
// with Node's runner (the storefront convention: only src/lib/*.js is tested).
// Image URLs are the client's own atelier.co.nz photography, the same source
// the brand pages hotlink.

export const PRICE_VALIDITY_NOTE =
  'Please note, prices quoted are valid for 5 working days.'

export const BESPOKE_HOUSES = Object.freeze([
  Object.freeze({
    slug: 'pierre-frey',
    name: 'Pierre Frey',
    categories: Object.freeze(['Area rugs', 'Furniture']),
    blurb:
      'The inventive Paris maison makes area rugs and furniture entirely to measure, sized, coloured and finished to your scheme by the same ateliers behind its fabric collections.',
    images: Object.freeze([
      Object.freeze({
        src: 'https://www.atelier.co.nz/wp-content/uploads/2025/11/PF_2025_CAPPUCCINO_LE-REPOS-DU-TOUCAN_FP238_V1-scaled.jpg',
        alt: 'Pierre Frey Cappuccino collection — Le Repos du Toucan in an interior setting',
      }),
      Object.freeze({
        src: 'https://www.atelier.co.nz/wp-content/uploads/2025/11/PF_2025_CARROUSEL_LE-ZEBRE-DU-CARROUSEL_F4069_LAUTRUCHE-DU-CARROUSEL_F4070_LA-GIRAFE-DU-CARROUSEL_F4071_V3-scaled.jpg',
        alt: 'Pierre Frey Carrousel collection — upholstered furniture in Le Zèbre, L’Autruche and La Girafe',
      }),
      Object.freeze({
        src: 'https://www.atelier.co.nz/wp-content/uploads/2024/11/PF_2024_BELVEDERE_PILE_H.jpg',
        alt: 'Pierre Frey Belvédère collection — layered textiles',
      }),
    ]),
  }),
  Object.freeze({
    slug: 'cc-milano',
    name: 'C&C Milano',
    categories: Object.freeze(['Bedding', 'Table linen']),
    blurb:
      'The Milanese house of refined linens makes bedding and table linen to order: bed covers, sheeting, tablecloths and napery cut to your dimensions in its own Italian workrooms.',
    images: Object.freeze([
      Object.freeze({
        src: 'https://www.atelier.co.nz/wp-content/uploads/2021/07/A5A0487-700x1050.jpg',
        alt: 'C&C Milano linens dressed in an interior setting',
      }),
      Object.freeze({
        src: 'https://www.atelier.co.nz/wp-content/uploads/2022/05/Monaco-700x1089.jpg',
        alt: 'C&C Milano Monaco — table dressed in Italian linen',
      }),
      Object.freeze({
        src: 'https://www.atelier.co.nz/wp-content/uploads/2024/03/3-Gea-Fabric-700x700.jpg',
        alt: 'C&C Milano Gea fabric detail',
      }),
    ]),
  }),
  Object.freeze({
    slug: 'loro-piana',
    name: 'Loro Piana Interiors',
    categories: Object.freeze(['Throws', 'Cushions', 'Area rugs']),
    blurb:
      'Cashmere, vicuña and the world’s finest fibres, made up as throws, cushions and area rugs to your specification. The house’s celebrated lofts, translated for the home.',
    images: Object.freeze([
      Object.freeze({
        src: 'https://www.atelier.co.nz/wp-content/uploads/2022/05/Doubling-Up-RGB_Oasis-Throws-700x1050.jpg',
        alt: 'Loro Piana Interiors Oasis throws, layered',
      }),
      Object.freeze({
        src: 'https://www.atelier.co.nz/wp-content/uploads/2021/07/Loro-Piana-Interiors-Upholstery-Decoration-Connemara-1-700x934.jpg',
        alt: 'Loro Piana Interiors Connemara — upholstery and decoration',
      }),
      Object.freeze({
        src: 'https://www.atelier.co.nz/wp-content/uploads/2021/07/Loro-Piana-Interiors_Scirocco-fabric-for-curtains_Linen_-1-700x953.jpg',
        alt: 'Loro Piana Interiors Scirocco linen at the window',
      }),
    ]),
  }),
  Object.freeze({
    slug: 'maria-flora',
    name: 'Maria Flora',
    categories: Object.freeze(['Area rugs']),
    blurb:
      'The Italian spinner and weaver of indoor-outdoor cloth makes area rugs to measure, woven to your size and palette, at home inside or under the sky.',
    images: Object.freeze([
      Object.freeze({
        src: 'https://www.atelier.co.nz/wp-content/uploads/2021/05/ALBORAN0445-700x467.jpg',
        alt: 'Maria Flora Alboran — outdoor textiles in situ',
      }),
      Object.freeze({
        src: 'https://www.atelier.co.nz/wp-content/uploads/2021/07/Immagini-MF-FU0183-700x1050.jpg',
        alt: 'Maria Flora woven cloth detail',
      }),
    ]),
  }),
  Object.freeze({
    slug: 'de-le-cuona',
    name: 'de Le Cuona',
    categories: Object.freeze(['Throws', 'Cushions']),
    blurb:
      'Famed for exquisitely understated linen and natural fibres, de Le Cuona makes throws and cushions to order: quietly luxurious pieces finished in the cloth of your choosing.',
    images: Object.freeze([
      Object.freeze({
        src: 'https://www.atelier.co.nz/wp-content/uploads/2022/05/deLeCuona-Cashmere-Velvet-CVE3-Speakeasy-SPK6-SPK7-Cashmere-Velvet-CVE2-Bearcat-BEA4-Old-Hollywood-OLH8-Lifestyle-Original-Large-700x933.jpg',
        alt: 'de Le Cuona cashmere velvet cushions and throws, layered on a sofa',
      }),
      Object.freeze({
        src: 'https://www.atelier.co.nz/wp-content/uploads/2024/04/deLeCuona-La-Boheme-Primrose-BOH5-Fig-BOH6-Nettle-BOH7-Tosca-TSC6-700x933.jpg',
        alt: 'de Le Cuona La Bohème linens in Primrose, Fig and Nettle',
      }),
      Object.freeze({
        src: 'https://www.atelier.co.nz/wp-content/uploads/2025/01/deLeCuona-Lifestyle-YUR4-NIL3-CHU9-VIE14-V2-LR.jpg',
        alt: 'de Le Cuona natural linens in a lifestyle setting',
      }),
    ]),
  }),
])

// The editorial entry for a slug, or null — never throws on an unknown slug.
export const findBespokeHouse = (slug) =>
  BESPOKE_HOUSES.find((house) => house.slug === slug) ?? null

// The house a page hands the enquiry form: the API's own name (the CRM's
// spelling) with the editorial categories where this file has them. A house
// flagged bespoke in the CRM but absent here still gets a working form — the
// subject line only needs the name.
export const bespokeHouseFor = (brand) => {
  if (!brand?.slug) return null
  const editorial = findBespokeHouse(brand.slug)
  return Object.freeze({
    slug: brand.slug,
    name: brand.name ?? editorial?.name ?? brand.slug,
    categories: editorial?.categories ?? Object.freeze([]),
  })
}

// Cards for the /bespoke wall. Membership is the CRM's `bespoke` flag, so the
// office adds a house without a deploy; the photograph is the editorial one
// here, else the house's own image from the CRM, else none (the card paints the
// weave). With no brand list at all (the API is down) the wall falls back to the
// editorial houses, so the page still renders.
export const bespokeCards = (brands) => {
  const list = Array.isArray(brands) ? brands.filter((brand) => brand?.bespoke) : BESPOKE_HOUSES
  return Object.freeze(
    list.map((brand) => {
      const editorial = findBespokeHouse(brand.slug)
      return Object.freeze({
        slug: brand.slug,
        name: brand.name,
        href: `/brands/${encodeURIComponent(brand.slug)}`,
        image: editorial?.images[0]?.src ?? brand.image_url ?? null,
        // The maison's own mark, set over the tile in place of the typeset
        // name — the same field and the same fallback `/brands` and the home's
        // brands row use (Userback, 14 Sep 2026: "brand logo on top"). The
        // editorial fallback list has no logos, so it keeps the name.
        logo_url: brand.logo_url ?? null,
      })
    })
  )
}

// Everything an enquiry accumulates that belongs to ONE submission: the chosen
// category, and the outcome of pressing send. One object, seeded by one
// function, so the form's state is a single value with a known blank.
export const blankEnquiryState = () => ({
  category: '',
  submitting: false,
  submitError: '',
  fieldErrors: {},
  sent: false,
})

// Subject line the back office sees in the enquiries inbox / email. The house
// (and category, when chosen) travel here because POST /contact has no
// structured fields for them.
export const bespokeSubject = (house, category) =>
  category ? `Bespoke enquiry — ${house.name} (${category})` : `Bespoke enquiry — ${house.name}`

// Payload for POST /contact. Blank optional fields are omitted (undefined), the
// same shape ContactForm.jsx sends.
export const bespokeEnquiryPayload = ({ house, category, name, email, phone, message }) => ({
  name: name.trim(),
  email: email.trim(),
  phone: phone.trim() || undefined,
  subject: bespokeSubject(house, category),
  message: message.trim(),
})
