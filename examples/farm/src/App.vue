<script setup lang="ts">
import { ref } from 'vue'
const msg = ref('')
</script>

<template>
  <div>
    <h1>Hello world</h1>
    <h2>{{ msg }}</h2>
    <input v-model="msg" type="text" />
  </div>
</template>
