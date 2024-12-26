<script setup lang="ts">
import { ref } from 'vue'
const msg = ref('')
</script>

<template>
  <div>
    <h1 class="text-red">Hello world</h1>
    <h2>{{ msg }}</h2>222
    <input v-model="msg" type="text" />
  </div>
</template>

<style scoped>
.text-red {
  color: red;
}
</style>
