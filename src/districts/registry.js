import { buildDistrict } from '../engine/model.js'
import meta from '../../data/campusville/meta.json'
import places from '../../data/campusville/places.csv?raw'
import activities from '../../data/campusville/activities.csv?raw'
import residences from '../../data/campusville/residences.csv?raw'
import events from '../../data/campusville/events.json'
import hours from '../../data/campusville/hours.json'
import courses from '../../data/campusville/courses.json'
import besties from '../../data/campusville/besties.json'
import twists from '../../data/campusville/twists.json'
import jobs from '../../data/campusville/jobs.json'
import shop from '../../data/campusville/shop.json'

export const districts = {
  campusville: buildDistrict({
    meta, places, activities, residences, events, hours, courses, besties, twists, jobs, shop,
  }),
}

export const defaultDistrictId = 'campusville'

export function districtById(id) {
  return districts[id] || districts[defaultDistrictId]
}
