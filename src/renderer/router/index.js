import { createRouter, createWebHashHistory } from 'vue-router'

// 路由级代码分割：页面组件按需加载，首屏只拉取校对页所在 chunk
const About = () => import('../views/About.vue')
const APISet = () => import('../views/APISet.vue')
const Proof = () => import('../views/Proof.vue')
const ProofSet = () => import('../views/ProofSet.vue')
const History = () => import('../views/history.vue')
const Knowledge = () => import('../views/Dictionary.vue')

const routes = [
  {
    path: '/',
    name: 'Home',
    redirect: '/proof'
  },
  {
    path: '/about',
    name: 'About',
    component: About
  },
  {
    path: '/proof',
    name: 'Proof',
    component: Proof
  },
  {
    path: '/api',
    name: 'APISet',
    component: APISet
  },
  {
    path: '/set',
    name: 'Set',
    component: ProofSet
  },
  {
    path: '/history',
    name: 'History',
    component: History
  },
  {
    path: '/dictionary',
    name: 'Knowledge',
    component: Knowledge
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
